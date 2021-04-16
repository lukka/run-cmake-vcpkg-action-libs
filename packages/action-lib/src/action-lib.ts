// Copyright (c) 2019-2020-2021 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as stream from 'stream';
import * as baselib from '@lukka/base-lib';
import * as utils from '@lukka/base-util-lib';
import * as core from '@actions/core';
import * as execIfaces from '@actions/exec/lib/interfaces';
import * as toolrunner from '@actions/exec/lib/toolrunner';
import * as ioutil from '@actions/io/lib/io-util';
import * as io from '@actions/io/lib/io';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';

function escapeCmdCommand(command: string): string {
  command = command.trim();
  if (!/^\".*\"$/.test(command))
    command = `\"${command}\"`;
  return command;
}

function escapeShArgument(argument: string): string {
  // escape all blanks: blank -> \blank
  return argument.replace(/ /g, '\\ ');
}

function escapeCmdExeArgument(argument: string): string {
  // \" -> \\"
  argument = argument.replace(/(\\*)"/g, '$1$1\\"');

  // \$ -> \\$
  argument = argument.replace(/(\\*)$/g, '$1$1');

  // All other backslashes occur literally.

  // Quote the whole thing:
  argument = `"${argument}"`;

  // Prefix with caret ^ any character to be escaped, as in:
  // http://www.robvanderwoude.com/escapechars.php
  // Do not escape %, let variable be passed in as is.
  const metaCharsRegExp = /([()\][!^"`<>&|;, *?])/g;
  argument = argument.replace(metaCharsRegExp, '^$1');

  return argument;
}

/**
 * Run a command with arguments in a shell.
 * Note: -G Ninja or -GNinja? The former works witha shell, the second does not work without a shell.
 * e.spawnSync('cmake', ['-GNinja', '.'], {shell:false, stdio:'inherit', cwd:'/Users/git_repos/cmake-task-tests/'}) -> Configuring done.
 * e.spawnSync('cmake', ['-G Ninja', '.'], {shell:false, stdio:'inherit', cwd:'/Users/git_repos/cmake-task-tests/'}) -> CMake Error: Could not create named generator  Ninja
 * e.spawnSync('cmake', ['-G Ninja', '.'], {shell:true, stdio:'inherit', cwd:'/Users/git_repos/cmake-task-tests/'}) -> -- Configuring done
 * e.spawnSync('cmake', ['-GNinja', '.'], {shell:true, stdio:'inherit', cwd:'/Users/git_repos/cmake-task-tests/'}) -> -- Configuring done
 * Hence the caller of this function is always using no spaces in between arguments.
 * Exception is arbitrary text coming from the user, which will hit this problem when not using a shell.
 * 
 * Other corner cases:
 * e.spawnSync('cmake', ['-GUnix Makefiles', '.'], {shell:true, stdio:'inherit', cwd:'/Users/git_repos/cmake-task-tests/'}) -> CMake Error: Could not create named generator Unix
 * e.spawnSync('cmake', ['-GUnix\ Makefiles', '.'], {shell:false, stdio:'inherit', cwd:'/Users/git_repos/cmake-task-tests/'}) -> -- Configuring done
 > e.spawnSync('cmake', ['-GUnix Makefiles', '.'], {shell:false, stdio:'inherit', cwd:'/Users/git_repos/cmake-task-tests/'}) -> -- Configuring done
 e.spawnSync('cmake', ['-G Unix Makefiles', '.'], {shell:false, stdio:'inherit', cwd:'/Users/git_repos/cmake-task-tests/'}) -> CMake Error: Could not create named generator  Unix Makefiles
 * @static
 * @param {string} commandPath
 * @param {string[]} args
 * @param {baselib.ExecOptions} [execOptions]
 * @returns {Promise<number>}
 * @memberof ActionLib
 */
async function exec(commandPath: string, args: string[], execOptions?: execIfaces.ExecOptions): Promise<number> {
  core.debug(`exec(${commandPath}, ${JSON.stringify(args)}, {${execOptions?.cwd}})<<`);

  let useShell: string | boolean = false;
  if (process.env.INPUT_USESHELL === 'true')
    useShell = true;
  else if (process.env.INPUT_USESHELL === 'false') {
    useShell = false;
  } else if (process.env.INPUT_USESHELL) {
    useShell = process.env.INPUT_USESHELL;
  }

  const opts: cp.SpawnOptions = {
    shell: useShell,
    windowsVerbatimArguments: false,
    cwd: execOptions?.cwd,
    env: execOptions?.env,
    stdio: "pipe",
  };

  let args2 = args;
  if ((typeof useShell === 'string' && useShell.includes('cmd')) ||
    (process.platform === 'win32' && typeof useShell === 'boolean' && useShell === true)) {
    args2 = [];
    args.map((arg) => args2.push(escapeCmdExeArgument(arg)));

    // When using a shell, the command must be enclosed by quotes to handle blanks correctly.
    commandPath = escapeCmdCommand(commandPath);
  }
  else if (((typeof useShell === 'string' && !useShell.includes('cmd')) ||
    (process.platform !== 'win32' && typeof useShell === 'boolean' && useShell === true))) {
    args2 = [];
    args.map((arg) => args2.push(escapeShArgument(arg)));

    // When using a Unix shell, blanks needs to be escaped in the command as well.
    commandPath = escapeShArgument(commandPath);
  }
  args = args2;

  core.debug(`cp.spawn("${commandPath}", ${JSON.stringify(args)}, {cwd=${opts?.cwd}, shell=${opts?.shell}, path=${JSON.stringify(opts?.env?.PATH)}})`);
  return new Promise<number>((resolve, reject) => {
    const child: cp.ChildProcess = cp.spawn(`${commandPath}`, args, opts);

    if (execOptions && child.stdout) {
      child.stdout.on('data', (chunk: Buffer) => {
        if (execOptions.listeners && execOptions.listeners.stdout) {
          execOptions.listeners.stdout(chunk);
        }
        process.stdout.write(chunk);
      });
    }
    if (execOptions && child.stderr) {
      child.stderr.on('data', (chunk: Buffer) => {
        if (execOptions.listeners && execOptions.listeners.stderr) {
          execOptions.listeners.stderr(chunk);
        }
        process.stdout.write(chunk);
      });
    }

    child.on('error', (error: Error) => {
      core.debug(`${error}`);
      // Wait one second to get still some output.
      setTimeout(
        () => {
          reject(error);
          child.removeAllListeners()
        }
        , 1000);
    });

    child.on('exit', (exitCode: number) => {
      core.debug(`Exit code '${exitCode}' received from command '${commandPath}'`);
      // Do not resolve yet, wait for the close event.
    });

    child.on('close', (exitCode: number) => {
      core.debug(`STDIO streams have closed for command '${commandPath}'`);
      child.removeAllListeners();
      resolve(exitCode);
    });
  });
}

export class ActionToolRunner implements baselib.ToolRunner {

  private arguments: string[] = [];

  constructor(private readonly path: string) {
  }

  _argStringToArray(text: string): string[] {
    return this.__argStringToArray(text);
  }

  exec(options: baselib.ExecOptions): Promise<number> {
    return exec(this.path, this.arguments, options);
  }

  line(val: string): void {
    this.arguments = this.arguments.concat(toolrunner.argStringToArray(val));
  }

  arg(val: string | string[]): void {
    if (val instanceof Array) {
      this.arguments = this.arguments.concat(val);
    }
    else if (typeof (val) === 'string') {
      this.arguments = this.arguments.concat(val.trim());
    }
  }

  async execSync(options?: baselib.ExecOptions): Promise<baselib.ExecResult> {
    let stdout = "";
    let stderr = "";

    let options2: execIfaces.ExecOptions | undefined;
    if (options) {
      options2 = this.convertExecOptions(options);
      options2.listeners = {
        stdout: (data: Buffer): void => {
          stdout += data.toString();
        },
        stderr: (data: Buffer): void => {
          stderr += data.toString();
        }
      };
    }

    const exitCode: number = await exec(this.path, this.arguments, options2);
    const res2: baselib.ExecResult = {
      code: exitCode,
      stdout: stdout,
      stderr: stderr
    } as baselib.ExecResult;

    return Promise.resolve(res2);
  }

  private convertExecOptions(options: baselib.ExecOptions): execIfaces.ExecOptions {
    const result: any = {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      silent: options.silent ?? false,
      failOnStdErr: options.failOnStdErr ?? false,
      ignoreReturnCode: options.ignoreReturnCode ?? false,
      windowsVerbatimArguments: options.windowsVerbatimArguments ?? false,
      listeners: {
        stdout: options.listeners?.stdout,
        stderr: options.listeners?.stderr,
      }
    } as execIfaces.ExecOptions;
    result.outStream = options.outStream || process.stdout as stream.Writable;
    result.errStream = options.errStream || process.stderr as stream.Writable;

    return result;
  }

  private __argStringToArray(argString: string): string[] {
    const args: string[] = [];
    let inQuotes = false;
    let escaped = false;
    let lastCharWasSpace = true;
    let arg = '';
    const append = function (c: string): void {
      // we only escape double quotes.
      if (escaped && c !== '"') {
        arg += '\\';
      }
      arg += c;
      escaped = false;
    };
    for (let i = 0; i < argString.length; i++) {
      const c = argString.charAt(i);
      if (c === ' ' && !inQuotes) {
        if (!lastCharWasSpace) {
          args.push(arg);
          arg = '';
        }
        lastCharWasSpace = true;
        continue;
      }
      else {
        lastCharWasSpace = false;
      }
      if (c === '"') {
        if (!escaped) {
          inQuotes = !inQuotes;
        }
        else {
          append(c);
        }
        continue;
      }
      if (c === "\\" && escaped) {
        append(c);
        continue;
      }
      if (c === "\\" && inQuotes) {
        escaped = true;
        continue;
      }
      append(c);
      lastCharWasSpace = false;
    }
    if (!lastCharWasSpace) {
      args.push(arg.trim());
    }
    return args;
  };
}

export class ActionLib implements baselib.BaseLib {

  getInput(name: string, isRequired: boolean): string {
    const value = core.getInput(name, { required: isRequired });
    this.debug(`getInput(${name}, ${isRequired}) -> '${value}'`);
    return value;
  }

  getBoolInput(name: string, isRequired: boolean): boolean {
    const value = (core.getInput(name, { required: isRequired }) ?? "").toUpperCase() === "TRUE";
    this.debug(`getBoolInput(${name}, ${isRequired}) -> '${value}'`);
    return value;
  }

  getPathInput(name: string, isRequired: boolean, checkExists: boolean): string {
    const value = path.resolve(core.getInput(name, { required: isRequired }));
    this.debug(`getPathInput(${name}) -> '${value}'`);
    if (checkExists) {
      if (!fs.existsSync(value))
        throw new Error(`input path '${value}' for '${name}' does not exist.`);
    }
    return value;
  }

  isFilePathSupplied(name: string): boolean {
    // normalize paths
    const pathValue = this.resolve(this.getPathInput(name, false, false) ?? '');
    const repoRoot = this.resolve(process.env.GITHUB_WORKSPACE ?? '');
    const isSupplied = pathValue !== repoRoot;
    this.debug(`isFilePathSupplied(s file path=('${name}') -> '${isSupplied}'`);
    return isSupplied;
  }

  getDelimitedInput(name: string, delim: string, required: boolean): string[] {
    const input = core.getInput(name, { required: required });
    const inputs: string[] = input.split(delim);
    this.debug(`getDelimitedInput(${name}, ${delim}, ${required}) -> '${inputs}'`);
    return inputs;
  }

  // Set an environment variable, re-usable in subsequent actions.
  setVariable(name: string, value: string): void {
    core.exportVariable(name, value);
  }

  // Set the output of the action.
  setOutput(name: string, value: string): void {
    core.setOutput(name, value);
  }

  getVariable(name: string): string {
    //?? Is it really fine to return an empty string in case of undefined variable?
    return process.env[name] ?? "";
  }

  debug(message: string): void {
    core.debug(message);
  }

  error(message: string): void {
    core.error(message);
  }

  warning(message: string): void {
    core.warning(message);
  }

  info(message: string): void {
    core.info(message);
  }

  tool(name: string): baselib.ToolRunner {
    return new ActionToolRunner(name);
  }

  async exec(path: string, args: string[], options?: baselib.ExecOptions): Promise<number> {
    return await exec(path, args, options);
  }

  async execSync(path: string, args: string[], options?: baselib.ExecOptions): Promise<baselib.ExecResult> {
    const exitCode: number = await exec(path, args, options);
    const result: baselib.ExecResult = {
      code: exitCode,
      stdout: "",
      stderr: ""
    } as baselib.ExecResult;

    return Promise.resolve(result);
  }

  async which(name: string, required: boolean): Promise<string> {
    core.debug(`"which(${name})<<`);
    const filePath = await io.which(name, required);
    console.log(`tool: ${filePath}`);
    core.debug(`"which(${name}) >> ${filePath}`);
    return filePath;
  }

  async rmRF(path: string): Promise<void> {
    await io.rmRF(path);
  }

  async mkdirP(path: string): Promise<void> {
    await io.mkdirP(path);
  }

  cd(path: string): void {
    process.chdir(path);
  }

  writeFile(path: string, content: string): void {
    fs.writeFileSync(path, content);
  }

  resolve(apath: string): string {
    core.debug(`"resolve(${apath})<<`);
    const resolvedPath = path.resolve(apath);
    core.debug(`"resolve(${apath})>> '${resolvedPath})'`);
    return resolvedPath;
  }

  stats(path: string): fs.Stats {
    return fs.statSync(path);
  }

  exist(path: string): Promise<boolean> {
    return ioutil.exists(path);
  }

  getBinDir(): string {
    if (!process.env.GITHUB_WORKSPACE) {
      throw new Error("GITHUB_WORKSPACE is not set.");
    }

    const binPath = utils.BaseUtilLib.normalizePath(path.join(process.env.GITHUB_WORKSPACE, "../b/"));
    if (!fs.existsSync(binPath)) {
      core.debug(`BinDir '${binPath}' does not exists, creating it...`);
      fs.mkdirSync(binPath);
    }

    return binPath;
  }

  getSrcDir(): string {
    if (!process.env.GITHUB_WORKSPACE) {
      throw new Error("GITHUB_WORKSPACE env var is not set.");
    }

    const srcPath = utils.BaseUtilLib.normalizePath(process.env.GITHUB_WORKSPACE);
    if (!fs.existsSync(srcPath)) {
      throw new Error(`SourceDir '${srcPath}' does not exists.`);
    }

    return srcPath;
  }

  getArtifactsDir(): string {
    if (!process.env.GITHUB_WORKSPACE) {
      throw new Error("GITHUB_WORKSPACE is not set.");
    }

    //?? HACK. How to get the value of '{{ runner.temp }}' in JS's action?
    const artifactsPath = utils.BaseUtilLib.normalizePath(path.join(process.env.GITHUB_WORKSPACE, "../../_temp"));
    if (!fs.existsSync(artifactsPath)) {
      core.debug(`ArtifactsDir '${artifactsPath}' does not exists, creating it...`);
      fs.mkdirSync(artifactsPath);
    }

    return artifactsPath;
  }

  beginOperation(message: string): void {
    core.startGroup(message);
  }
  endOperation(): void {
    core.endGroup()
  }

  addMatcher(file: string): void {
    console.log(`::add-matcher::${file}`);
  }

  removeMatcher(file: string): void {
    console.log(`::remove-matcher::${file}`);
  }
}
