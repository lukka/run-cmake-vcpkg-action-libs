// Copyright (c) 2019-2020-2021-2022-2023 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as baselib from '@lukka/base-lib';
import * as baseutillib from '@lukka/base-util-lib';
import * as cmakeutil from './cmake-utils'
import * as path from 'path'
import * as runvcpkglib from '@lukka/run-vcpkg-lib'

export function getVcpkgExePath(baseUtils: baseutillib.BaseUtilLib, vcpkgRoot: string): string {
  // Search for vcpkg tool and run it
  let vcpkgPath: string = path.join(vcpkgRoot, 'vcpkg');
  if (baseUtils.isWin32()) {
    vcpkgPath += '.exe';
  }
  return vcpkgPath;
}

export async function injectEnvVariables(baseUtils: baseutillib.BaseUtilLib, vcpkgRoot: string, args: string[]): Promise<void> {
  try {
    baseUtils.baseLib.debug(`injectEnvVariables()<<`);
    const vcpkgPath = getVcpkgExePath(baseUtils, vcpkgRoot);
    const vcpkg: baselib.ToolRunner = baseUtils.baseLib.tool(vcpkgPath);
    for (const arg of args) {
      vcpkg.arg(arg);
    }

    const options = {
      cwd: vcpkgRoot,
      failOnStdErr: false,
      errStream: process.stdout,
      outStream: process.stdout,
      ignoreReturnCode: true,
      silent: false,
      windowsVerbatimArguments: false,
      env: process.env
    } as baselib.ExecOptions;

    const output = await vcpkg.execSync(options);
    if (output.code !== 0) {
      throw new Error(`vcpkg failed with: ${output.stdout}\n\n${output.stderr}`);
    }

    const map = baseUtils.parseVcpkgEnvOutput(output.stdout);
    for (const key in map) {
      try {
        let newValue: string | undefined;
        if (baseUtils.isVariableStrippingPath(key))
          continue;
        if (key.toUpperCase() === "PATH") {
          newValue = process.env[key] + path.delimiter + map[key];
        } else {
          newValue = map[key];
        }
        if (!newValue)
          baseUtils.baseLib.warning(`The value for '${key}' cannot be determined.`);
        else {
          if (key in process.env) {
            const oldValue = process.env[key];
            baseUtils.baseLib.debug(`Env var '${key}' changed from '${oldValue}' to '${newValue}'.`);
          } else {
            baseUtils.baseLib.debug(`Set env var ${key}=${newValue}`);
          }
          process.env[key] = newValue;
        }
      }
      catch (err) {
        baseutillib.dumpError(baseUtils.baseLib, err as Error);
      }
    }
  }
  finally {
    baseUtils.baseLib.debug(`injectEnvVariables()>>`);
  }
}

export async function setupMsvc(
  baseUtils: baseutillib.BaseUtilLib,
  vcpkgRoot: string | undefined,
  vcpkgEnvStringFormat: string): Promise<void> {
  if (!baseUtils.isWin32()) {
    baseUtils.baseLib.debug(`Skipping setting up the environment since the platform is not Windows.`);
  } else {
    await baseUtils.wrapOp(`Setup MSVC C/C++ toolset environment variables`, async () => {
      if (!vcpkgRoot || vcpkgRoot.length == 0) {
        baseUtils.baseLib.info(`Skipping setting up the environment since VCPKG_ROOT is not defined, and it is required to locate the vcpkg executable which provides the environment variables to be set for MSVC.`);
        const vcpkgRoot: string | undefined = process.env[runvcpkglib.VCPKGROOT];
      } else {
        // if VCPKG_ROOT is defined, then use vcpkg to setup the environment.
        if (process.env.CXX || process.env.CC) {
          // If a C++ compiler is user-enforced, skip setting up the environment for MSVC.
          baseUtils.baseLib.info(`Skipping setting up the environment since CXX or CC environment variables are defined. This allows user customization of used MSVC version.`);
        } else {
          const vcpkgPath = cmakeutil.getVcpkgExePath(baseUtils, vcpkgRoot);
          if (!vcpkgPath || !baseUtils.fileExists(vcpkgPath)) {
            baseUtils.baseLib.warning(`Skipping setting up the environment since vcpkg's executable is not found at: '${vcpkgPath}'.`);
          } else {
            // If defined(Win32) && (!defined(CC) && !defined(CXX)), let's hardcode CC and CXX so that CMake uses the MSVC toolset.
            process.env['CC'] = "cl.exe";
            process.env['CXX'] ="cl.exe";

            // Use vcpkg to set the environment using provided command line (which includes the triplet).
            // This is only useful to setup the environment for MSVC on Windows.
            baseutillib.setEnvVarIfUndefined(runvcpkglib.VCPKGDEFAULTTRIPLET, baseUtils.getDefaultTriplet());
            const vcpkgEnvArgsString: string = baseutillib.replaceFromEnvVar(vcpkgEnvStringFormat);
            const vcpkgEnvArgs: string[] = eval(vcpkgEnvArgsString);
            baseUtils.baseLib.debug(`'vcpkg env' arguments: ${vcpkgEnvArgs}`);
            await cmakeutil.injectEnvVariables(baseUtils, vcpkgRoot, vcpkgEnvArgs);
          }
        }
      }
    });
  }
}
