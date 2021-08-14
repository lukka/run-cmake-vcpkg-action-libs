// Copyright (c) 2019-2020-2021 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as path from 'path';
import * as baselib from '@lukka/base-lib';
import * as baseutillib from '@lukka/base-util-lib';
import * as vcpkgGlobals from './vcpkg-globals'

export class CMakeUtils {
  constructor(private readonly baseUtils: baseutillib.BaseUtilLib) {
  }

  public async injectEnvVariables(vcpkgRoot: string, triplet: string, baseLib: baselib.BaseLib): Promise<void> {
    await this.baseUtils.wrapOp(`Setup environment variables for triplet '${triplet}' using 'vcpkg env'`, async () => {

      // Search for vcpkg tool and run it
      let vcpkgPath: string = path.join(vcpkgRoot, 'vcpkg');
      if (this.baseUtils.isWin32()) {
        vcpkgPath += '.exe';
      }
      const vcpkg: baselib.ToolRunner = baseLib.tool(vcpkgPath);
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
      } as baselib.ExecOptions;

      const output = await vcpkg.execSync(options);
      if (output.code !== 0) {
        throw new Error(`${output.stdout}\n\n${output.stderr}`);
      }

      const map = this.baseUtils.parseVcpkgEnvOutput(output.stdout);
      for (const key in map) {
        if (this.baseUtils.isVariableStrippingPath(key))
          continue;
        if (key.toUpperCase() === "PATH") {
          process.env[key] = process.env[key] + path.delimiter + map[key];
        } else {
          process.env[key] = map[key];
        }
        baseLib.debug(`set ${key}=${process.env[key]}`)
      }
    });
  }

  public async setEnvironmentForVcpkgTriplet(triplet: string, baseLib: baselib.BaseLib): Promise<void> {
    const vcpkgRoot: string | undefined = process.env[vcpkgGlobals.vcpkgRoot];

    // if VCPKG_ROOT is defined, then use it.
    if (triplet && vcpkgRoot && vcpkgRoot.length > 1) {
      // For Windows build agents, inject the environment variables used
      // for the MSVC compiler using the 'vcpkg env' command.
      // This is not needed for others compiler on Windows, but it should be harmless.
      if (this.baseUtils.isWin32()) {
        if (triplet.indexOf("windows") !== -1) {
          process.env.CC = "cl.exe";
          process.env.CXX = "cl.exe";
          baseLib.setVariable("CC", "cl.exe");
          baseLib.setVariable("CXX", "cl.exe");
        }

        await this.injectEnvVariables(vcpkgRoot, triplet, baseLib);
      }
    }
  }
}