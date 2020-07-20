// Copyright (c) 2019-2020 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as vcpkgGlobals from './vcpkg-globals'
import * as path from 'path';
import * as baselib from '@lukka/base-lib';
import * as utils from '@lukka/base-lib/src/utils';


export class VcpkgUtils {
  private baseUtils: utils.BaseLibUtils;

  constructor(private readonly baseLib: baselib.BaseLib) {
    this.baseUtils = new utils.BaseLibUtils(baseLib);
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

    const map = this.parseVcpkgEnvOutput(output.stdout);
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
}
