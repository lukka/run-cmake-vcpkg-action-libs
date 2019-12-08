// Copyright (c) 2019-2020 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as stream from 'stream';
import * as baselib from './base-lib';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as execIfaces from '@actions/exec/lib/interfaces';
import * as ioutil from '@actions/io/lib/io-util';
import * as io from '@actions/io/lib/io';
import * as fs from 'fs';
import * as path from 'path';

export class ToolRunner implements baselib.ToolRunner {

  private args: string[] = [];

  constructor(private readonly path: string) {
  }

  exec(options: baselib.ExecOptions): Promise<number> {
    const options2: execIfaces.ExecOptions = this.convertExecOptions(options);

    return exec.exec(`"${this.path}"`, this.args, options2);
  }

  line(val: string): void {
    this.args = this.args.concat(this.argStringToArray(val));
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

    const exitCode: number = await exec.exec(`"${this.path}"`, this.args, options2);
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

  private argStringToArray(argString: string): string[] {
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
    }

    for (let i = 0; i < argString.length; i++) {
      const c: string = argString.charAt(i);

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
    return Promise.resolve(exec.exec(`"${path}"`, args, options));
  }

  async execSync(path: string, args: string[], options?: baselib.ExecOptions): Promise<baselib.ExecResult> {
    // Note: the exec.exec() fails to launch an executable that contains blanks in its path/name. Sorrounding with double quotes is mandatory.
    const exitCode: number = await exec.exec(`"${path}"`, args, options);
    const res2: baselib.ExecResult = {
      code: exitCode,
      stdout: "",
      stderr: ""
    } as baselib.ExecResult;

    return Promise.resolve(res2);
  }

  async which(name: string, required: boolean): Promise<string> {
    return io.which(name, required);
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
    return path.resolve(apath);
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

    //?? HACK. How to get the {{ runner.temp }} path in JS's action?
    const artifactsPath = baselib.normalizePath(path.resolve(path.join(process.env.GITHUB_WORKSPACE, "../../_temp")));
    if (!fs.existsSync(artifactsPath)) {
      core.debug(`ArtifactsDir '${artifactsPath}' does not exists, creating it...`);
      fs.mkdirSync(artifactsPath);
    }

    return artifactsPath;
  }

}
