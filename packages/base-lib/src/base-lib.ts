// Copyright (c) 2019-2020-2021 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as stream from 'stream';
import * as fs from 'fs';

export interface VarMap { [key: string]: string }

export interface ExecResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
  readonly error: Error;
}

export interface GlobOptions {
  readonly followSymLink: boolean;
}

export interface ExecOptions {
  cwd: string;
  failOnStdErr: boolean;
  ignoreReturnCode: boolean;
  silent: boolean;
  windowsVerbatimArguments: boolean;
  env: {
    [key: string]: string;
  };
  outStream: stream.Writable;
  errStream: stream.Writable;
  listeners?: {
    stdout?: (data: Buffer) => void;
    stderr?: (data: Buffer) => void;
  };
}

export interface ToolRunner {
  exec(options: ExecOptions): Promise<number>;
  line(line: string): void;
  arg(val: string | string[]): void;
  execSync(options?: ExecOptions): Promise<ExecResult>;
  _argStringToArray(argString: string): string[];
}

export interface BaseLib {
  getInput(name: string, required: boolean): string | undefined;
  getPathInput(name: string, required: boolean, check: boolean): string | undefined;
  getBoolInput(name: string, required: boolean): boolean | undefined;
  isFilePathSupplied(name: string): boolean;
  getDelimitedInput(name: string, delim: string, required: boolean): string[];
  setVariable(name: string, value: string): void;
  getVariable(name: string): string | undefined;
  setState(name: string, value: string): void;
  getState(name: string): string;
  setOutput(name: string, value: string): void;
  debug(message: string): void;
  error(message: string): void;
  warning(message: string): void;
  info(message: string): void;
  tool(name: string): ToolRunner;
  exec(name: string, args: string[], options?: ExecOptions): Promise<number>;
  execSync(name: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
  which(name: string, required: boolean): Promise<string>;
  rmRF(path: string): Promise<void>;
  mkdirP(path: string): Promise<void>;
  cd(path: string): void;
  writeFile(path: string, content: string): void;
  stats(path: string): fs.Stats;
  exist(path: string): Promise<boolean>;
  getBinDir(): Promise<string>;
  getSrcDir(): Promise<string>;
  getArtifactsDir(): Promise<string>;
  beginOperation(message: string): void;
  endOperation(): void;
  addMatcher(file: string): void;
  removeMatcher(owner: string): void;
  hashFiles(fileGlob: string, options?: GlobOptions): Promise<string>;
}
