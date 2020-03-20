// Copyright (c) 2019-2020 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as stream from 'stream';
import * as baselib from './base-lib';
import * as core from '@actions/core';
import * as execIfaces from '@actions/exec/lib/interfaces';
import * as toolrunner from '@actions/exec/lib/toolrunner';
import * as ioutil from '@actions/io/lib/io-util';
import * as io from '@actions/io/lib/io';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';

const isWin32 = process.platform === 'win32';

/**
 * Run a command with arguments in a shell.
 * Note: -G Ninja or -GNinja? The former works witha shell, the second does not work without a shell.
 * e.spawnSync('cmake', ['-GNinja', '.'], {shell:false, stdio:'inherit', cwd:'/Users/git_repos/cmake-task-tests/'}) -> Configuring done.
 * e.spawnSync('cmake', ['-G Ninja', '.'], {shell:false, stdio:'inherit', cwd:'/Users/git_repos/cmake-task-tests/'}) -> CMake Error: Could not create named generator  Ninja
 * e.spawnSync('cmake', ['-G Ninja', '.'], {shell:true, stdio:'inherit', cwd:'/Users/git_repos/cmake-task-tests/'}) -> -- Configuring done
 * e.spawnSync('cmake', ['-GNinja', '.'], {shell:true, stdio:'inherit', cwd:'/Users/git_repos/cmake-task-tests/'}) -> -- Configuring done
 * Hence the caller of this function is always using no spaces in between arguments.
 * Exception is arbitrary text coming from the user, which will hit this problem when not useing a shell.
 * 
 * Other corner cases:
 * e.spawnSync('cmake', ['-GUnix Makefiles', '.'], {shell:true, stdio:'inherit', cwd:'/Users/git_repos/cmake-task-tests/'}) -> CMake Error: Could not create named generator Unix
 * e.spawnSync('cmake', ['-GUnix\ Makefiles', '.'], {shell:false, stdio:'inherit', cwd:'/Users/git_repos/cmake-task-tests/'}) -> -- Configuring done
 > e.spawnSync('cmake', ['-GUnix Makefiles', '.'], {shell:false, stdio:'inherit', cwd:'/Users/git_repos/cmake-task-tests/'}) -> -- Configuring done
 e.spawnSync('cmake', ['-G Unix Makefiles', '.'], {shell:false, stdio:'inherit', cwd:'/Users/git_repos/cmake-task-tests/'}) -> CMake Error: Could not create named generator  Unix Makefiles
 * @static
 * @param {string} commandPath
 * @param {string[]} args
 * @param {baselib.ExecOptions} [options2]
 * @returns {Promise<number>}
 * @memberof ActionLib
 */
async function exec(commandPath: string, args: string[], options2?: baselib.ExecOptions): Promise<number> {
  core.debug(`exec(${commandPath}, ${JSON.stringify(args)}, ${options2?.cwd})<<`);

  let useShell: string | boolean = false;
  if (process.env.INPUT_USESHELL === 'true')
    useShell = true;
  else if (process.env.INPUT_USESHELL === 'false') {
    useShell = false;
  } else if (process.env.INPUT_USESHELL) {
    useShell = process.env.INPUT_USESHELL;
  }

  const opts: cp.SpawnSyncOptions = {
    shell: useShell,
    encoding: "utf8",
    windowsVerbatimArguments: false,
    cwd: options2?.cwd,
    env: options2?.env,
    stdio: "inherit"
  };

  core.debug(`exec("${commandPath}", ${JSON.stringify(args)}, {${opts?.cwd}, ${opts?.shell}})`);
  const ret = cp.spawnSync(`"${commandPath}"`, args, opts);

  return Promise.resolve(ret.status ?? -1000);
}

export class ToolRunner implements baselib.ToolRunner {

  private args: string[] = [];

  constructor(private readonly path: string) {
  }

  exec(options: baselib.ExecOptions): Promise<number> {
    return exec(this.path, this.args, options);
  }

  line(val: string): void {
    this.args = this.args.concat(toolrunner.argStringToArray(val));
  }

  arg(val: string | string[]): void {
    if (val instanceof Array) {
      this.args = this.args.concat(val);
    }
    else if (typeof (val) === 'string') {
      this.args = this.args.concat(val.trim());
    }
  }

  async execSync(options?: baselib.ExecOptions): Promise<baselib.ExecResult> {
    let stdout = "";
    let stderr = "";

    let options2: any | undefined = undefined;
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

    const exitCode: number = await exec(this.path, this.args, options2);
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
        stdout: (data: Buffer): void => void {
          // Nothing to do.
        },
        stderr: (data: Buffer): void => void {
          // Nothing to do.
        },
        stdline: (data: string): void => void {
        },
        errline: (data: string): void => void {
          // Nothing to do.
        },
        debug: (data: string): void => void {
          // Nothing to do.
        },
      }
    } as execIfaces.ExecOptions;
    result.outStream = options.outStream || process.stdout as stream.Writable;
    result.errStream = options.errStream || process.stderr as stream.Writable;

    return result;
  }
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

  getPathInput(name: string): string {
    const value = core.getInput(name);
    this.debug(`getPathInput(${name}) -> '${value}'`);
    return value;
  }

  isFilePathSupplied(name: string): boolean {
    // normalize paths
    const pathValue = this.resolve(this.getPathInput(name) ?? '');
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

  tool(name: string): baselib.ToolRunner {
    return new ToolRunner(name);
  }

  exec(path: string, args: string[], options?: baselib.ExecOptions): Promise<number> {
    return Promise.resolve(exec(path, args, options));
  }

  async execSync(path: string, args: string[], options?: baselib.ExecOptions): Promise<baselib.ExecResult> {
    const exitCode: number = await exec(`"${path}"`, args, options);
    const res2: baselib.ExecResult = {
      code: exitCode,
      stdout: "",
      stderr: ""
    } as baselib.ExecResult;

    return Promise.resolve(res2);
  }

  async which(name: string, required: boolean): Promise<string> {
    core.debug(`"which(${name})<<`);
    const filePath = await io.which(name, required);
    console.log(filePath);
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

    const binPath = baselib.normalizePath(path.resolve(path.join(process.env.GITHUB_WORKSPACE, "../b/")));
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

    const srcPath = baselib.normalizePath(path.resolve(process.env.GITHUB_WORKSPACE));
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
    const artifactsPath = baselib.normalizePath(path.resolve(path.join(process.env.GITHUB_WORKSPACE, "../../_temp")));
    if (!fs.existsSync(artifactsPath)) {
      core.debug(`ArtifactsDir '${artifactsPath}' does not exists, creating it...`);
      fs.mkdirSync(artifactsPath);
    }

    return artifactsPath;
  }
}
