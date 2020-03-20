// Copyright (c) 2019-2020 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as ifacelib from './base-lib'

let baseLib: ifacelib.BaseLib;

export const cachingFormatEnvName = 'AZP_CACHING_CONTENT_FORMAT';

export function setBaseLib(tl: ifacelib.BaseLib): void {
  baseLib = tl;
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
    const readString: string = fs.readFileSync(path, { encoding: 'utf8', flag: 'r' });
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