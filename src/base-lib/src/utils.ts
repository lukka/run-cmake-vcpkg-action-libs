// Copyright (c) 2019-2020 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as utils from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as ifacelib from './base-lib';
import * as admZip from 'adm-zip';
import * as http from 'follow-redirects'
import * as del from 'del'
import * as cmakeGlobals from '../../run-cmake-lib/src/cmake-globals'
import * as vcpkgGlobals from '../../run-vcpkg-lib/src/vcpkg-globals'

let baseLib: ifacelib.BaseLib;

export const cachingFormatEnvName = 'AZP_CACHING_CONTENT_FORMAT';

export function setBaseLib(tl: ifacelib.BaseLib): void {
  baseLib = tl;
}

export function getBaseLib(): ifacelib.BaseLib {
  return baseLib;
}

export async function isVcpkgSubmodule(gitPath: string, fullVcpkgPath: string): Promise<boolean> {
  try {
    const options: ifacelib.ExecOptions = {
      cwd: process.env.BUILD_SOURCESDIRECTORY,
      failOnStdErr: false,
      errStream: process.stdout,
      outStream: process.stdout,
      ignoreReturnCode: true,
      silent: false,
      windowsVerbatimArguments: false,
      env: process.env
    } as ifacelib.ExecOptions;

    const res: ifacelib.ExecResult = await baseLib.execSync(gitPath, ['submodule', 'status', fullVcpkgPath], options);
    let isSubmodule = false;
    if (res.error !== null) {
      isSubmodule = res.code == 0;
      let msg: string;
      msg = `'git submodule ${fullVcpkgPath}': exit code='${res.code}' `;
      if (res.stdout !== null) {
        msg += `, stdout='${res.stdout.trim()}'`;
      }
      if (res.stderr !== null) {
        msg += `, stderr='${res.stderr.trim()}'`;
      }
      msg += '.';

      baseLib.debug(msg);
    }

    return isSubmodule;
  }
  catch (error) {
    baseLib.warning(`ïsVcpkgSubmodule() failed: ${error}`);
    return false;
  }
}

export function throwIfErrorCode(errorCode: number): void {
  if (errorCode !== 0) {
    const errMsg = `Last command execution failed with error code '${errorCode}'.`;
    baseLib.error(errMsg);
    throw new Error(errMsg);
  }
}

export function isWin32(): boolean {
  return os.platform().toLowerCase() === 'win32';
}

export function isMacos(): boolean {
  return os.platform().toLowerCase() === 'darwin';
}

// freeBSD or openBSD
export function isBSD(): boolean {
  return os.platform().toLowerCase().indexOf("bsd") != -1;
}

export function isLinux(): boolean {
  return os.platform().toLowerCase() === 'linux';
}

export function isDarwin(): boolean {
  return os.platform().toLowerCase() === 'Darwin';
}

export function getVcpkgExePath(vcpkgRoot: string): string {
  const vcpkgExe: string = isWin32() ? "vcpkg.exe" : "vcpkg"
  const vcpkgExePath: string = path.join(vcpkgRoot, vcpkgExe);
  return vcpkgExePath;
}

export function directoryExists(path: string): boolean {
  try {
    return baseLib.stats(path).isDirectory();
  } catch (error) {
    baseLib.debug(`directoryExists(${path}): ${"" + error}`);
    return false;
  }
}

export function fileExists(path: string): boolean {
  try {
    return baseLib.stats(path).isFile();
  } catch (error) {
    baseLib.debug(`fileExists(${path}): ${"" + error}`);
    return false;
  }
}

export function readFile(path: string): [boolean, string] {
  try {
    const readString: string = utils.readFileSync(path, { encoding: 'utf8', flag: 'r' });
    baseLib.debug(`readFile(${path})='${readString}'.`);
    return [true, readString];
  } catch (error) {
    baseLib.debug(`readFile(${path}): ${"" + error}`);
    return [false, error];
  }
}

export function writeFile(file: string, content: string): void {
  baseLib.debug(`Writing to file '${file}' content '${content}'.`);
  baseLib.writeFile(file, content);
}

export function getDefaultTriplet(): string {
  const envVar = process.env["VCPKG_DEFAULT_TRIPLET"];
  if (envVar) {
    return envVar;
  } else {
    if (isWin32()) {
      return "x86-windows";
    } else if (isLinux()) {
      return "x64-linux";
    } else if (isMacos()) {
      return "x64-osx";
    } else if (isBSD()) {
      return "x64-freebsd";
    }
  }
  return "";
}

export function extractTriplet(args: string, readFile: (path: string) => [boolean, string]): string | null {
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
        const t = extractTriplet(content, readFile);
        if (t) {
          return t.trim();
        }
      }
    }
  }
  return triplet;
}

export function resolveArguments(args: string, readFile: (path: string) => [boolean, string]): string {
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
      const resolvedFilePath: string = baseLib.resolve(arg);
      if (baseLib.exist(resolvedFilePath)) {
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
export function setEnvVar(name: string, value: string): void {
  // Set variable both as env var and as step variable, which might be re-used in subseqeunt steps.  
  process.env[name] = value;
  baseLib.setVariable(name, value);
  baseLib.debug(`Set variable and the env variable '${name}' to value '${value}'.`);
}

export function trimString(value?: string): string {
  return value?.trim() ?? "";
}

export async function wrapOp<T>(name: string, fn: () => Promise<T>): Promise<T> {
  baseLib.beginOperation(name);

  let result: T

  try {
    result = await fn();
  } finally {
    baseLib.endOperation();
  }

  return result
}

export function wrapOpSync<T>(name: string, fn: () => T): T {
  baseLib.beginOperation(name);

  let result: T;
  try {
    result = fn();
  } finally {
    baseLib.endOperation();
  }

  return result;
}

function isVariableStrippingPath(variableName: string): boolean {
  // Avoid that the PATH is minimized by MSBuild props:
  // https://github.com/lukka/run-cmake/issues/8#issuecomment-606956604
  return (variableName.toUpperCase() === "__VSCMD_PREINIT_PATH")
}

/**
 * Check whether the current generator selected in the command line
 * is -G Ninja or -G Ninja Multi-Config.
 * @export
 * @param {string} commandLineString The command line as string
 * @returns {boolean}
 */
export function isNinjaGenerator(args: string[]): boolean {
  for (const arg of args) {
    if (/-G[\s]*(?:\"Ninja.*\"|Ninja.*)/.test(arg))
      return true;
  }

  return false;
}

export function isMakeProgram(args: string[]): boolean {
  for (const arg of args) {
    if (/-DCMAKE_MAKE_PROGRAM/.test(arg))
      return true;
  }

  return false;
}

export function isToolchainFile(args: string[]): boolean {
  for (const arg of args) {
    if (/-DCMAKE_TOOLCHAIN_FILE/.test(arg))
      return true;
  }

  return false;
}

export function getToolchainFile(args: string[]): string | undefined {
  baseLib.debug(`getToolchainFile(${JSON.stringify(args)})<<`);
  for (const arg of args) {
    const matches = /-DCMAKE_TOOLCHAIN_FILE(?::[^\s]*)?=([^\s]*)/.exec(arg);

    if (matches != null) {
      if (matches.length > 1) {
        baseLib.debug(`match found=${matches[1]}`);
        return matches[1];
      }
    }
  }

  return undefined;
}

export function removeToolchainFile(args: string[]): string[] {
  return args.filter(a => !/-DCMAKE_TOOLCHAIN_FILE(:[A-Za-z]+)?=[^\s]+/.test(a));
}

export function mkdir(target: string, options: utils.MakeDirectoryOptions): void {
  utils.mkdirSync(target, options);
}

export function rm(target: string): void {
  del.sync(target);
}

export function test(aPath: any): boolean {
  const result: boolean = utils.existsSync(aPath);
  return result;
}

export async function downloadFile(url: string): Promise<string> {
  const downloadsDirName = "dl";
  // validate parameters
  if (!url) {
    throw new Error('downloadFile: Parameter "url" must be set.');
  }

  const downloadsDirectory = path.join(await baseLib.getBinDir(), downloadsDirName);
  const scrubbedUrl = url.replace(/[/\:?]/g, '_');
  const targetPath = path.join(downloadsDirectory, scrubbedUrl);
  const marker = targetPath + '.completed';

  // skip if already downloaded
  if (test(marker)) {
    console.log(`Found downloaded file at: ${targetPath}`);
    return Promise.resolve(targetPath);
  } else {
    console.log(`Downloading url '${url}' to file '${targetPath}'.`);

    // delete any previous partial attempt
    if (test(targetPath)) {
      rm(targetPath);
    }

    // download the file
    mkdir(downloadsDirectory, { recursive: true });
    const file: utils.WriteStream = utils.createWriteStream(targetPath, { autoClose: true });

    return new Promise<string>((resolve: any, reject: any) => {
      const request = http.https.get(url, (response) => {
        response.pipe(file).on('finish', () => {
          baseLib.debug(`statusCode: ${response.statusCode}.`);
          baseLib.debug(`headers: ${response.headers}.`)
          console.log(`'${url}' downloaded to: '${targetPath}'`);
          utils.writeFileSync(marker, '');
          request.end();
          resolve(targetPath)
        }).on('error', (error: Error) =>
          reject(new Error(`statusCode='${response.statusCode}', error='${error.toString()}'.`)));
      });
    });
  }
}

export class Downloader {
  static async downloadFile(url: string): Promise<string> {
    return await downloadFile(url);
  }

  /**
   * Downloads and extracts an archive file.
   * @returns The path to the extracted content.
   */
  static async downloadArchive(url: string): Promise<string> {
    if (!url) {
      throw new Error('downloadArchive: url must be provided!');
    }

    try {
      const targetFileName: string = url.replace(/[\/\\:?]/g, '_');
      // 'x' for extracted content.
      const targetPath: string =
        path.join(await baseLib.getBinDir(), 'x', targetFileName);
      const marker: string = targetPath + '.completed';
      if (!test(marker)) {
        // download the whole archive.
        const archivePath = await downloadFile(url);

        // extract the archive overwriting anything.
        console.log(`Extracting archive '${archivePath}' ...`);
        mkdir(targetPath, { recursive: true });
        const zip = new admZip(archivePath);
        zip.extractAllTo(targetPath, true);

        // write the completed file marker.
        utils.writeFileSync(marker, '');
      }

      return targetPath;
    } catch (exception) {
      throw new Error(`Failed to download the Ninja executable: '${exception}'.`);
    }
  }
}

interface VarMap { [key: string]: string };

function parseVcpkgEnvOutput(data: string): VarMap {
  const map: VarMap = {};
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

export async function injectEnvVariables(vcpkgRoot: string, triplet: string): Promise<void> {
  if (!vcpkgRoot) {
    vcpkgRoot = process.env[vcpkgGlobals.outVcpkgRootPath] ?? "";
    if (!vcpkgRoot) {
      throw new Error(`${vcpkgGlobals.outVcpkgRootPath} environment variable is not set.`);
    }
  }

  // Search for CMake tool and run it
  let vcpkgPath: string = path.join(vcpkgRoot, 'vcpkg');
  if (isWin32()) {
    vcpkgPath += '.exe';
  }
  const vcpkg: ifacelib.ToolRunner = baseLib.tool(vcpkgPath);
  vcpkg.arg("env");
  vcpkg.arg("--bin");
  vcpkg.arg("--include");
  vcpkg.arg("--tools");
  vcpkg.arg("--python");
  vcpkg.line(`--triplet ${triplet} set`);

  const options = {
    cwd: vcpkgRoot,
    failOnStdErr: false,
    errStream: process.stdout,
    outStream: process.stdout,
    ignoreReturnCode: true,
    silent: false,
    windowsVerbatimArguments: false,
    env: process.env
  } as ifacelib.ExecOptions;

  const output = await vcpkg.execSync(options);
  if (output.code !== 0) {
    throw new Error(`${output.stdout}\n\n${output.stderr}`);
  }

  const map = parseVcpkgEnvOutput(output.stdout);
  for (const key in map) {
    if (isVariableStrippingPath(key))
      continue;
    if (key.toUpperCase() === "PATH") {
      process.env[key] = process.env[key] + path.delimiter + map[key];
    } else {
      process.env[key] = map[key];
    }
    baseLib.debug(`set ${key}=${process.env[key]}`)
  }
}

export async function injectVcpkgToolchain(args: string[], triplet: string): Promise<string[]> {
  args = args ?? [];
  const vcpkgRoot: string | undefined = process.env[vcpkgGlobals.outVcpkgRootPath];

  // if RUNVCPKG_VCPKG_ROOT is defined, then use it, and put aside into
  // VCPKG_CHAINLOAD_TOOLCHAIN_FILE the existing toolchain.
  if (vcpkgRoot && vcpkgRoot.length > 1) {
    const toolchainFile: string | undefined =
      getToolchainFile(args);
    args = removeToolchainFile(args);
    const vcpkgToolchain: string =
      path.join(vcpkgRoot, '/scripts/buildsystems/vcpkg.cmake');
    args.push(`-DCMAKE_TOOLCHAIN_FILE=${vcpkgToolchain}`);
    if (toolchainFile) {
      args.push(`-DVCPKG_CHAINLOAD_TOOLCHAIN_FILE=${toolchainFile}`);
    }

    // If the triplet is provided, specify the same triplet on the cmd line and set the environment for msvc.
    if (triplet) {
      args.push(`-DVCPKG_TARGET_TRIPLET=${triplet}`);

      // For Windows build agents, inject the environment variables used
      // for the MSVC compiler using the 'vcpkg env' command.
      // This is not be needed for others compiler on Windows, but it should be harmless.
      if (isWin32() && triplet) {
        if (triplet.indexOf("windows") !== -1) {
          process.env.CC = "cl.exe";
          process.env.CXX = "cl.exe";
          baseLib.setVariable("CC", "cl.exe");
          baseLib.setVariable("CXX", "cl.exe");
        }

        await injectEnvVariables(vcpkgRoot, triplet);
      }
    }
  }

  return args;
}

/**
 * Get a set of commands to be run in the shell of the host OS.
 * @export
 * @param {string[]} args
 * @returns {(trm.ToolRunner | undefined)}
 */
export async function getScriptCommand(args: string): Promise<ifacelib.ToolRunner | undefined> {

  let tool: ifacelib.ToolRunner;
  if (isWin32()) {
    const cmdExe = process.env.COMSPEC ?? "cmd.exe";
    const cmdPath: string = await baseLib.which(cmdExe, true);
    tool = baseLib.tool(cmdPath);
    tool.arg('/c');
    tool.line(args);
  } else {
    const shPath: string = await baseLib.which('sh', true);
    tool = baseLib.tool(shPath);
    tool.arg('-c');
    tool.arg(args);
    return tool;
  }
}

/**
 * Normalize a filesystem path with path.normalize(), then remove any trailing space.
 *
 * @export
 * @param {string} aPath The string representing a filesystem path.
 * @returns {string} The normalized path without trailing slash.
 */
export function normalizePath(aPath: string): string {
  aPath = path.normalize(aPath);
  if (/[\\\/]$/.test(aPath) && aPath.length > 1)
    aPath = aPath.slice(0, -1);
  return aPath;
}

export class Matcher {
  constructor(private name: string, private fromPath?: string) {
    const matcherFilePath = path.join(__dirname, `${name}.json`);
    fromPath;
    baseLib.addMatcher(matcherFilePath);
  }

  dispose(): void {
    baseLib.removeMatcher(path.join(__dirname, `${this.name}.json`));
  }
}

export function createMatcher(name: string, fromPath?: string): Matcher {
  return new Matcher(name, fromPath);
}
