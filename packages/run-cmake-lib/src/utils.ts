// Copyright (c) 2019-present Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as path from 'path';
import * as baselib from '@lukka/base-lib';
import * as vcpkgGlobals from './vcpkg-globals'

export class CMakeUtils {
  constructor(private readonly baseUtils: baselib.BaseLibUtils) {
  }

  public async injectEnvVariables(vcpkgRoot: string, triplet: string, baseLib: baselib.BaseLib): Promise<void> {
    if (!vcpkgRoot) {
      vcpkgRoot = process.env[vcpkgGlobals.outVcpkgRootPath] ?? "";
      if (!vcpkgRoot) {
        throw new Error(`${vcpkgGlobals.outVcpkgRootPath} environment variable is not set.`);
      }
    }

    // Search for CMake tool and run it
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
  }

 public async injectVcpkgToolchain(args: string[], triplet: string, baseLib: baselib.BaseLib): Promise<string[]> {
  args = args ?? [];
  const vcpkgRoot: string | undefined = process.env[vcpkgGlobals.outVcpkgRootPath];

  // if RUNVCPKG_VCPKG_ROOT is defined, then use it, and put aside into
  // VCPKG_CHAINLOAD_TOOLCHAIN_FILE the existing toolchain.
  if (vcpkgRoot && vcpkgRoot.length > 1) {
    const toolchainFile: string | undefined =
      this.baseUtils.getToolchainFile(args);
    args = this.baseUtils.removeToolchainFile(args);
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
      if (this.baseUtils.isWin32() && triplet) {
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

  return args;
}

}