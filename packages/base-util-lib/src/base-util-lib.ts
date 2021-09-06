// Copyright (c) 2019-2020-2021 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as http from 'follow-redirects'
import * as del from 'del'
import { performance } from 'perf_hooks'
import * as baselib from "@lukka/base-lib"
import * as glob from "glob"

export class BaseUtilLib {

  public constructor(public readonly baseLib: baselib.BaseLib) {
  }

  public async isVcpkgSubmodule(gitPath: string, fullVcpkgPath: string): Promise<boolean> {
    try {
      const options: baselib.ExecOptions = {
        cwd: process.env.BUILD_SOURCESDIRECTORY,
        failOnStdErr: false,
        errStream: process.stdout,
        outStream: process.stdout,
        ignoreReturnCode: true,
        silent: false,
        windowsVerbatimArguments: false,
        env: process.env
      } as baselib.ExecOptions;

      const res: baselib.ExecResult = await this.baseLib.execSync(gitPath, ['submodule', 'status', fullVcpkgPath], options);
      let isSubmodule = false;
      if (res.error !== null) {
        isSubmodule = res.code == 0;
        let msg: string;
        msg = `'git submodule ${fullVcpkgPath}': exit code='${res.code}' `;
        // If not null or undefined.
        if (res.stdout) {
          msg += `, stdout='${res.stdout.trim()}'`;
        }
        // If not null or undefined.
        if (res.stderr) {
          msg += `, stderr='${res.stderr.trim()}'`;
        }
        msg += '.';

        this.baseLib.debug(msg);
      }

      return isSubmodule;
    }
    catch (error) {
      this.baseLib.warning(`ïsVcpkgSubmodule() failed: ${error}`);
      return false;
    }
  }

  public throwIfErrorCode(errorCode: number): void {
    if (errorCode !== 0) {
      const errMsg = `Last command execution failed with error code '${errorCode}'.`;
      this.baseLib.error(errMsg);
      throw new Error(errMsg);
    }
  }

  public isWin32(): boolean {
    return os.platform().toLowerCase() === 'win32';
  }

  public isMacos(): boolean {
    return os.platform().toLowerCase() === 'darwin';
  }

  // freeBSD or openBSD
  public isBSD(): boolean {
    return os.platform().toLowerCase().indexOf("bsd") != -1;
  }

  public isLinux(): boolean {
    return os.platform().toLowerCase() === 'linux';
  }

  public isDarwin(): boolean {
    return os.platform().toLowerCase() === 'darwin';
  }

  public getVcpkgExePath(vcpkgRoot: string): string {
    const vcpkgExe: string = this.isWin32() ? "vcpkg.exe" : "vcpkg"
    const vcpkgExePath: string = path.join(vcpkgRoot, vcpkgExe);
    return vcpkgExePath;
  }

  public directoryExists(path: string): boolean {
    try {
      return this.baseLib.stats(path).isDirectory();
    } catch (error) {
      this.baseLib.debug(`directoryExists(${path}): ${"" + error}`);
      return false;
    }
  }

  public fileExists(path: string): boolean {
    try {
      return this.baseLib.stats(path).isFile();
    } catch (error) {
      this.baseLib.debug(`fileExists(${path}): ${"" + error}`);
      return false;
    }
  }

  public readFile(path: string): string | null {
    try {
      const readString: string = fs.readFileSync(path, { encoding: 'utf8', flag: 'r' });
      this.baseLib.debug(`readFile(${path})='${readString}'.`);
      return readString;
    } catch (error) {
      this.baseLib.debug(`readFile(${path}): ${"" + error}`);
      return null;
    }
  }

  public writeFile(file: string, content: string): void {
    this.baseLib.debug(`Writing to file '${file}' content '${content}'.`);
    this.baseLib.writeFile(file, content);
  }

  public getDefaultTriplet(): string {
    const envVar = process.env["VCPKG_DEFAULT_TRIPLET"];
    if (envVar) {
      return envVar;
    } else {
      if (this.isWin32()) {
        return "x86-windows";
      } else if (this.isLinux()) {
        return "x64-linux";
      } else if (this.isMacos()) {
        return "x64-osx";
      } else if (this.isBSD()) {
        return "x64-freebsd";
      }
    }
    return "";
  }

  // Force 'name' env variable to have value of 'value'.
  public setEnvVar(name: string, value: string): void {
    // Set variable both as env var and as step variable, which might be re-used in subseqeunt steps.  
    process.env[name] = value;
    this.baseLib.setVariable(name, value);
    this.baseLib.debug(`Set variable and the env variable '${name}' to value '${value}'.`);
  }

  public trimString(value?: string): string {
    return value?.trim() ?? "";
  }

  public async wrapOp<T>(name: string, fn: () => Promise<T>): Promise<T> {
    this.baseLib.beginOperation(name);

    let result: T
    const startTime = performance.now();
    try {
      result = await fn();
    } finally {
      this.baseLib.endOperation();
      this.baseLib.info(`⏱ elapsed: ${((performance.now() - startTime) / 1000.).toFixed(3)} seconds`);
    }

    return result
  }

  public wrapOpSync<T>(name: string, fn: () => T): T {
    this.baseLib.beginOperation(name);

    let result: T;
    const startTime = performance.now();
    try {
      result = fn();
    } finally {
      this.baseLib.endOperation();
      this.baseLib.info(`⏱ elapsed: ${((performance.now() - startTime) / 1000.).toFixed(3)} seconds`);
    }

    return result;
  }

  public isMakeProgram(args: string[]): boolean {
    for (const arg of args) {
      if (/-DCMAKE_MAKE_PROGRAM/.test(arg))
        return true;
    }

    return false;
  }

  public mkdir(target: string, options: fs.MakeDirectoryOptions): void {
    fs.mkdirSync(target, options);
  }

  public rm(target: string): void {
    del.sync(target);
  }

  public test(aPath: string): boolean {
    const result: boolean = fs.existsSync(aPath);
    return result;
  }

  public isVariableStrippingPath(variableName: string): boolean {
    // Avoid that the PATH is minimized by MSBuild props:
    // https://github.com/lukka/run-cmake/issues/8#issuecomment-606956604
    return (variableName.toUpperCase() === "__VSCMD_PREINIT_PATH")
  }

  public parseVcpkgEnvOutput(data: string): baselib.VarMap {
    const map: baselib.VarMap = {};
    const regex = {
      param: /^\s*([^=]+?)\s*=\s*(.*?)\s*$/,
    };
    const lines = data.split(/[\r\n]+/);
    for (const line of lines) {
      if (regex.param.test(line)) {
        const match = line.match(regex.param);
        if (match) {
          map[match[1]] = match[2];
        }
      }
    }

    return map;
  }

  /**
   * Normalize a filesystem path with path.normalize(), then remove any trailing space.
   *
   * @export
   * @param {string} aPath The string representing a filesystem path.
   * @returns {string} The normalized path without trailing slash.
   */
  public static normalizePath(aPath: string): string {
    aPath = path.normalize(aPath);
    if (/[\\\/]$/.test(aPath) && aPath.length > 1)
      aPath = aPath.slice(0, -1);
    return aPath;
  }

  public static throwIfUndefined<T>(obj: T, name: string): void {
    if (obj === undefined)
      throw new Error(`Agument '${name}' is undefined`);
  }

  public static throwIfNull<T>(obj: T, name: string): void {
    if (obj === null)
      throw new Error(`Agument '${name}' is null`);
  }

  public static isValidSHA1(text: string): boolean {
    return /^[a-fA-F0-9]{40}$/.test(text);
  }

  /**
   * Get the hash of one (and only one) file.
   * @export
   * @param {string} globExpr A glob expression to identify one file.
   * @returns {string} The file hit and its hash, or [null, null] if no its.
   * @throws When multiple hits occur.
   */
  public async getFileHash(globExpr: string): Promise<[string | null, string | null]> {
    const files = await new Promise<string[]>((resolve, reject) => {
      try { glob.glob(globExpr, (err, matches) => resolve(matches)); } catch (err) { reject(err); }
    });

    if (files.length > 1) {
      throw new Error(`Error computing hash on '${globExpr}' as it matches multiple files: ${files}. It must match only one file.`);
    }
    if (files.length == 0) {
      return [null, null];
    }
    const file = path.resolve(files[0]);

    const fileHash = await this.baseLib.hashFiles(file);
    return [fileHash, file];
  }
}

export class Matcher {
  constructor(private name: string, private baseLib: baselib.BaseLib, private fromPath?: string) {
    const matcherFilePath = path.join(__dirname, `${name}.json`);
    fromPath;
    this.baseLib.addMatcher(matcherFilePath);
  }

  dispose(): void {
    this.baseLib.removeMatcher(path.join(__dirname, `${this.name}.json`));
  }

  public static createMatcher(name: string, baseLib: baselib.BaseLib, fromPath?: string): Matcher {
    return new Matcher(name, baseLib, fromPath);
  }
}

export function dumpError(baseLib: baselib.BaseLib, error: Error): void {
  const errorAsString = (error?.message ?? "undefined error");
  baseLib.debug(errorAsString);
  if (error?.stack) {
    baseLib.debug(error.stack);
  }
}

export class LogFileCollector {
  private readonly regExps: RegExp[] = [];
  private bufferString = "";
  public static readonly MAXLEN = 1024;
  public constructor(private baseLib: baselib.BaseLib, regExps: string[],
    private func: (path: string) => void) {
    for (const s of regExps) {
      this.regExps.push(new RegExp(s, "g"));
    }
  }

  private appendBuffer(buffer: Buffer): void {
    this.bufferString += buffer.toString();
  }

  private limitBuffer(consumeUntil?: number): void {
    if (consumeUntil && consumeUntil > 0)
      this.bufferString = this.bufferString.slice(consumeUntil);
    const len = this.bufferString.length;
    if (len > LogFileCollector.MAXLEN)
      this.bufferString = this.bufferString.slice(len - LogFileCollector.MAXLEN);
  }

  public handleOutput(buffer: Buffer): void {
    this.appendBuffer(buffer);

    //?? this.baseLib.debug(`\n\nappending: ${buffer}\n\n`);
    //?? this.baseLib.debug(`\n\nbuffer: ${this.bufferString}\n\n`);
    let consumedUntil = -1;
    for (const re of this.regExps) {
      re.lastIndex = 0;
      try {
        if (re.test(this.bufferString)) {
          re.lastIndex = 0;
          const matches = re.exec(this.bufferString);
          if (matches) {
            consumedUntil = Math.max(consumedUntil, re.lastIndex);
            this.baseLib.debug(`\n\nmatched expression: ${re}\n\n`);
            this.func(matches[1]);
          }
        }
      }
      catch (err) {
        dumpError(this.baseLib, err as Error);
      }
    }

    this.limitBuffer(consumedUntil);
    //?? this.baseLib.debug(`\n\nremaining: ${this.bufferString}\n\n`);
  }
}

export function dumpFile(baseLib: baselib.BaseLib, filePath: string): void {
  try {
    if (filePath && fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath);
      if (content) {
        baseLib.info(`[LogCollection][Start]File:'${filePath}':\n${content}\n[LogCollection][End]File:'${filePath}'.`);
      }
      else
        baseLib.warning(`[LogCollection][Warn]File empty:'${filePath}'.`);
    }
    else
      baseLib.warning(`[LogCollection][Warn]File not found:'${filePath}'.`);
  }
  catch (err) {
    dumpError(baseLib, err as Error);
  }
}

export interface KeySet {
  primary: string;
  restore?: string[];
}

export function CreateKeySet(segments: string[]): KeySet {
  const keys: string[] = [];
  for (let i: number = segments.length; i > 0; i--) {
    let key: string = segments[0];
    for (let j = 1; j < i; j++) {
      key += `_${segments[j]}`;
    }
    keys.push(key);
  }

  // Extract the primary key and all the rest.
  const primaryKey = keys.shift();
  if (!primaryKey)
    throw Error("CreateKeySet(): primary key is undefined!");

  return { primary: primaryKey, restore: keys } as KeySet;
}