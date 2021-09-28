// Copyright (c) 2019-2020-2021 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as cmakeutil from 'path';
import * as baselib from '@lukka/base-lib';
import * as baseutillib from '@lukka/base-util-lib';

export async function injectEnvVariables(baseUtils: baseutillib.BaseUtilLib, vcpkgRoot: string, args: string[]): Promise<void> {
  // Search for vcpkg tool and run it
  let vcpkgPath: string = cmakeutil.join(vcpkgRoot, 'vcpkg');
  if (baseUtils.isWin32()) {
    vcpkgPath += '.exe';
  }
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
    throw new Error(`${output.stdout}\n\n${output.stderr}`);
  }

  const map = baseUtils.parseVcpkgEnvOutput(output.stdout);
  for (const key in map) {
    if (baseUtils.isVariableStrippingPath(key))
      continue;
    if (key.toUpperCase() === "PATH") {
      process.env[key] = process.env[key] + cmakeutil.delimiter + map[key];
    } else {
      process.env[key] = map[key];
    }
    baseUtils.baseLib.debug(`set ${key}=${process.env[key]}`)
  }
}

export function setEnvVarIfUndefined(name: string, value: string | null): void {
  if (!process.env[name] && value)
    process.env[name] = value;
}


