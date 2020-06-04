// Copyright (c) 2019-present Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as vcpkgGlobals from './vcpkg-globals'
import * as path from 'path';
import * as ifacelib from '@lukka/base-lib';
import * as utils from '@lukka/base-lib/src/utils';

export async function injectEnvVariables(vcpkgRoot: string, triplet: string, baseLib: ifacelib.BaseLib): Promise<void> {
  if (!vcpkgRoot) {
    vcpkgRoot = process.env[vcpkgGlobals.outVcpkgRootPath] ?? "";
    if (!vcpkgRoot) {
      throw new Error(`${vcpkgGlobals.outVcpkgRootPath} environment variable is not set.`);
    }
  }

  // Search for CMake tool and run it
  let vcpkgPath: string = path.join(vcpkgRoot, 'vcpkg');
  if (utils.isWin32()) {
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

  const map = utils.parseVcpkgEnvOutput(output.stdout);
  for (const key in map) {
    if (utils.isVariableStrippingPath(key))
      continue;
    if (key.toUpperCase() === "PATH") {
      process.env[key] = process.env[key] + path.delimiter + map[key];
    } else {
      process.env[key] = map[key];
    }
    baseLib.debug(`set ${key}=${process.env[key]}`)
  }
}
