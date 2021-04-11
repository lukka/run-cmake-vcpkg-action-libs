// Copyright (c) 2019-2020-2021 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as baselib from '@lukka/base-lib';
import AdmZip from 'adm-zip';
import * as http from 'follow-redirects'
import * as del from 'del'
import { performance } from 'perf_hooks'

export class BaseUtilLib {

  public static readonly cachingFormatEnvName = 'AZP_CACHING_CONTENT_FORMAT';

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

  public readFile(path: string): [boolean, string] {
    try {
      const readString: string = fs.readFileSync(path, { encoding: 'utf8', flag: 'r' });
      this.baseLib.debug(`readFile(${path})='${readString}'.`);
      return [true, readString];
    } catch (error) {
      this.baseLib.debug(`readFile(${path}): ${"" + error}`);
      return [false, error];
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

  public static extractTriplet(args: string, readFile: (path: string) => [boolean, string]): string | null {
    let triplet: string | null = null;
    // Split string on any 'whitespace' character
    const argsSplitted: string[] = args.split(/\s/).filter((a) => a.length != 0);
    let index = 0;
    for (; index < argsSplitted.length; index++) {
      let arg: string = argsSplitted[index].trim();
      // remove all whitespace characters (e.g. newlines, tabs, blanks)
      arg = arg.replace(/\s/, '')
      if (arg === "--triplet") {
        index++;
        if (index < argsSplitted.length) {
          triplet = argsSplitted[index];
          return triplet.trim();
        }
      }
      if (arg.startsWith("@")) {
        const [ok, content] = readFile(arg.substring(1));
        if (ok) {
          const t = BaseUtilLib.extractTriplet(content, readFile);
          if (t) {
            return t.trim();
          }
        }
      }
    }
    return triplet;
  }

  public resolveArguments(args: string, readFile: (path: string) => [boolean, string]): string {
    let resolvedArguments = "";

    // Split string on any 'whitespace' character
    const argsSplitted: string[] = args.split(/\s/).filter((a) => a.length != 0);
    let index = 0;
    for (; index < argsSplitted.length; index++) {
      let arg: string = argsSplitted[index].trim();
      // remove all whitespace characters (e.g. newlines, tabs, blanks)
      arg = arg.replace(/\s/, '');
      let isResponseFile = false;
      if (arg.startsWith("@")) {
        const resolvedFilePath: string = BaseUtilLib.normalizePath(arg);
        if (this.baseLib.exist(resolvedFilePath)) {
          const [ok, content] = readFile(resolvedFilePath);
          if (ok && content) {
            isResponseFile = true;
            resolvedArguments += content;
          }
        }
      }

      if (!isResponseFile) {
        resolvedArguments += arg;
      }
    }

    return resolvedArguments;
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

  /**
   * Check whether the current generator selected in the command line
   * is -G Ninja or -G Ninja Multi-Config.
   * @export
   * @param {string} commandLineString The command line as string
   * @returns {boolean}
   */
  public isNinjaGenerator(args: string[]): boolean {
    for (const arg of args) {
      if (/-G[\s]*(?:\"Ninja.*\"|Ninja.*)/.test(arg))
        return true;
    }

    return false;
  }

  public isMakeProgram(args: string[]): boolean {
    for (const arg of args) {
      if (/-DCMAKE_MAKE_PROGRAM/.test(arg))
        return true;
    }

    return false;
  }

  public isToolchainFile(args: string[]): boolean {
    for (const arg of args) {
      if (/-DCMAKE_TOOLCHAIN_FILE/.test(arg))
        return true;
    }

    return false;
  }

  public getToolchainFile(args: string[]): string | undefined {
    this.baseLib.debug(`getToolchainFile(${JSON.stringify(args)})<<`);
    for (const arg of args) {
      const matches = /-DCMAKE_TOOLCHAIN_FILE(?::[^\s]*)?=([^\s]*)/.exec(arg);

      if (matches != null) {
        if (matches.length > 1) {
          this.baseLib.debug(`match found=${matches[1]}`);
          return matches[1];
        }
      }
    }

    return undefined;
  }

  public removeToolchainFile(args: string[]): string[] {
    return args.filter(a => !/-DCMAKE_TOOLCHAIN_FILE(:[A-Za-z]+)?=[^\s]+/.test(a));
  }

  public mkdir(target: string, options: fs.MakeDirectoryOptions): void {
    fs.mkdirSync(target, options);
  }

  public rm(target: string): void {
    del.sync(target);
  }

  public test(aPath: any): boolean {
    const result: boolean = fs.existsSync(aPath);
    return result;
  }

  public async downloadFile(url: string): Promise<string> {
    const downloadsDirName = "dl";
    // validate parameters
    if (!url) {
      throw new Error('downloadFile: Parameter "url" must be set.');
    }

    const downloadsDirectory = path.join(await this.baseLib.getBinDir(), downloadsDirName);
    const scrubbedUrl = url.replace(/[/\:?]/g, '_');
    const targetPath = path.join(downloadsDirectory, scrubbedUrl);
    const marker = targetPath + '.completed';

    // skip if already downloaded
    if (this.test(marker)) {
      console.log(`Found downloaded file at: ${targetPath}`);
      return Promise.resolve(targetPath);
    } else {
      console.log(`Downloading url '${url}' to file '${targetPath}'.`);

      // delete any previous partial attempt
      if (this.test(targetPath)) {
        this.rm(targetPath);
      }

      // download the file
      this.mkdir(downloadsDirectory, { recursive: true });
      const file: fs.WriteStream = fs.createWriteStream(targetPath, { autoClose: true });

      return new Promise<string>((resolve: any, reject: any) => {
        const request = http.https.get(url, (response) => {
          response.pipe(file).on('finish', () => {
            this.baseLib.debug(`statusCode: ${response.statusCode}.`);
            this.baseLib.debug(`headers: ${response.headers}.`)
            console.log(`'${url}' downloaded to: '${targetPath}'`);
            fs.writeFileSync(marker, '');
            request.end();
            resolve(targetPath)
          }).on('error', (error: Error) =>
            reject(new Error(`statusCode='${response.statusCode}', error='${error.toString()}'.`)));
        });
      });
    }
  }

  /**
   * Downloads and extracts an archive file.
   * @returns The path to the extracted content.
   */
  public async downloadArchive(url: string): Promise<string> {
    if (!url) {
      throw new Error('downloadArchive: url must be provided!');
    }

    try {
      const targetFileName: string = url.replace(/[\/\\:?]/g, '_');
      // 'x' for extracted content.
      const targetPath: string =
        path.join(await this.baseLib.getBinDir(), 'x', targetFileName);
      const marker: string = targetPath + '.completed';
      if (!this.test(marker)) {
        // download the whole archive.
        const archivePath = await this.downloadFile(url);

        // extract the archive overwriting anything.
        console.log(`Extracting archive '${archivePath}' ...`);
        this.mkdir(targetPath, { recursive: true });
        const zip = new AdmZip(archivePath);
        zip.extractAllTo(targetPath, true);

        // write the completed file marker.
        fs.writeFileSync(marker, '');
      }

      return targetPath;
    } catch (exception) {
      throw new Error(`Failed to download the Ninja executable: '${exception}'.`);
    }
  }

  /**
   * Get a set of commands to be run in the shell of the host OS.
   * @export
   * @param {string[]} args
   * @returns {(trm.ToolRunner | undefined)}
   */
  public async getScriptCommand(args: string): Promise<baselib.ToolRunner | undefined> {

    let tool: baselib.ToolRunner;
    if (this.isWin32()) {
      const cmdExe = process.env.COMSPEC ?? "cmd.exe";
      const cmdPath: string = await this.baseLib.which(cmdExe, true);
      tool = this.baseLib.tool(cmdPath);
      tool.arg('/c');
      tool.line(args);
    } else {
      const shPath: string = await this.baseLib.which('sh', true);
      tool = this.baseLib.tool(shPath);
      tool.arg('-c');
      tool.arg(args);
      return tool;
    }
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

  public static isValidSHA1(text: string): boolean {
    return /^[a-fA-F0-9]{40}$/.test(text);
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

