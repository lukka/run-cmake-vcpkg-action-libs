// Copyright (c) 2019-2020-2021-2022-2023 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as globals from '../src/vcpkg-globals';
import * as testutils from './utils';
import * as path from 'path';
import * as mock from './mocks';
import * as assert from 'assert';
import * as utils from '@lukka/base-util-lib';
import * as runvcpkgutils from '../src/vcpkg-utils'
import * as fastglob from 'fast-glob';

// Arrange.
const isWin = process.platform === "win32";
const vcpkgBaselineCommitId = '01d4567890123456789012345678901234567890';
const gitPath = '/usr/local/bin/git';
const vcpkgRoot = '/path/to/vcpkg';
const vcpkgExeName = isWin ? "vcpkg.exe" : "vcpkg";
const vcpkgExePath = path.join(vcpkgRoot, vcpkgExeName);
const prefix = isWin ? "cmd.exe /c " : "/bin/bash -c ";
const bootstrapName = isWin ? "bootstrap-vcpkg.bat" : "bootstrap-vcpkg.sh";
const vcpkgJsonFile = "/path/to/vcpkg.json";

mock.VcpkgMocks.isVcpkgSubmodule = false;
mock.VcpkgMocks.vcpkgRoot = vcpkgRoot;
mock.VcpkgMocks.vcpkgExePath = vcpkgExePath;

jest.mock('fast-glob',
  () => {
    return {
      glob: (globExpression: string | string[], _2: fastglob.Options | undefined) => {
        let returnValue: string[] = [];
        if (globExpression.includes(globals.VCPKG_JSON))
          returnValue = [vcpkgJsonFile];
        else
          returnValue = [];

        return Promise.resolve(returnValue);
      }
    }
  });

jest.spyOn(utils.BaseUtilLib.prototype, 'setEnvVar').mockImplementation(
  function (this: utils.BaseUtilLib, name: string, value: string): void {
    // Ensure they are not set twice.
    const existingValue: string = mock.envVarSetDict[name];
    if (existingValue) {
      assert.fail(`Error: env var ${name} is set multiple times!`);
    }

    // Ensure their values are the expected ones.
    switch (name) {
      case globals.VCPKGROOT:
      case globals.RUNVCPKG_VCPKG_ROOT:
        assert.strictEqual(value, vcpkgRoot);
        break;
      case globals.VCPKGDEFAULTTRIPLET:
      case globals.RUNVCPKG_VCPKG_DEFAULT_TRIPLET:
      case globals.VCPKG_BINARY_SOURCES:
        break;
      default:
        assert.fail(`Unexpected variable name: '${name}'`);
    }
  });

const baseUtil = new utils.BaseUtilLib(mock.exportedBaselib);

import { VcpkgRunner } from '../src/vcpkg-runner';

const answers: testutils.BaseLibAnswers = {
  "exec": {
    [`${gitPath}`]:
      { code: 0, stdout: "git output" },
    [`${gitPath} rev-parse HEAD`]:
      { code: 0, stdout: 'mygitref' },
    [`${gitPath} clone https://github.com/microsoft/vcpkg.git -n .`]:
      { 'code': 0, 'stdout': 'this is git clone ... output' },
    [`${gitPath} submodule status ${vcpkgRoot}`]:
      { 'code': 0, stdout: 'this is git submodule output' },
    [`${gitPath} checkout --force ${vcpkgBaselineCommitId}`]:
      { 'code': 0, 'stdout': `this is git checkout ${vcpkgBaselineCommitId} output` },
    [`chmod +x ${path.join(vcpkgRoot, "vcpkg")}`]:
      { 'code': 0, 'stdout': 'chmod output here' },
    [`chmod +x ${path.join(vcpkgRoot, "bootstrap-vcpkg.sh")}`]:
      { 'code': 0, 'stdout': 'this is the output of chmod +x bootstrap' },
    [`${prefix}${path.join(vcpkgRoot, bootstrapName)}`]:
      { 'code': 0, 'stdout': 'this is the output of bootstrap-vcpkg' },
  },
  "exist": { [vcpkgRoot]: true },
  'which': {
    'git': '/usr/local/bin/git',
    'sh': '/bin/bash',
    'chmod': '/bin/chmod',
    'cmd.exe': 'cmd.exe',
    [vcpkgExePath]: vcpkgExePath
  },
};

testutils.testWithHeader('run-vcpkg must pick up vcpkg.json baseline (from "builtin-baseline" property) and build and run successfully', async () => {
  let installRoot: string = await runvcpkgutils.getDefaultVcpkgInstallDirectory(baseUtil.baseLib);
  if (baseUtil.isWin32()) {
    installRoot = 'c:\\github\\workspace\\on\\windows\\';
    process.env[globals.VCPKG_INSTALLED_DIR] = installRoot;
  }

  mock.answersMocks.reset(answers);

  jest.spyOn(utils.BaseUtilLib.prototype, 'readFile').mockImplementation(
    function (this: utils.BaseUtilLib, file: string): string {
      if (testutils.areEqualVerbose(file, vcpkgJsonFile)) {
        return `{ "builtin-baseline": "${vcpkgBaselineCommitId}"}`;
      }
      else
        throw `readFile called with unexpected file name: '${file}'.`;
    });
  
  let vcpkg = await VcpkgRunner.create(
    baseUtil,
    vcpkgRoot,
    null,
    null,
    false, // Must be false, do not run 'vcpkg install'.
    false, // Must be false
    [],
    "**/vcpkg.json/", // vcpkg.json glob
    [], // vcpkg.json glob ignores
    "/path/to/vcpkgconfigurationjson", // vcpkg-configuration.json glob
    null);

  // Act.
  // HACK: 'any' to access private fields.
  let vcpkgBuildMock = jest.spyOn(vcpkg as any, 'build');
  try {
    await vcpkg.run();
  }
  catch (error) {
    throw new Error(`run must have succeeded, instead it failed: ${error as Error} \n ${(error as Error)?.stack}`);
  }

  // Assert.
  expect(mock.exportedBaselib.warning).toHaveBeenCalledTimes(0);
  expect(mock.exportedBaselib.error).toHaveBeenCalledTimes(0);
  expect(vcpkgBuildMock).toHaveBeenCalledTimes(1);
});

testutils.testWithHeader('run-vcpkg must pick up vcpkg.json baseline (from "default-registry" object) and build and run successfully', async () => {
  let installRoot: string = await runvcpkgutils.getDefaultVcpkgInstallDirectory(baseUtil.baseLib);
  if (baseUtil.isWin32()) {
    installRoot = 'c:\\github\\workspace\\on\\windows\\';
    process.env[globals.VCPKG_INSTALLED_DIR] = installRoot;
  }

  mock.answersMocks.reset(answers);

  const vcpkgJsonContent = 
`{
  "default-registry": {
    "kind": "builtin",
    "baseline": "${vcpkgBaselineCommitId}"
  }
}
`;
  
jest.spyOn(utils.BaseUtilLib.prototype, 'readFile').mockImplementation(
    function (this: utils.BaseUtilLib, file: string): string {
      if (testutils.areEqualVerbose(file, vcpkgJsonFile)) {
        return vcpkgJsonContent;
      }
      else
        throw `readFile called with unexpected file name: '${file}'.`;
    });
  
  let vcpkg = await VcpkgRunner.create(
    baseUtil,
    vcpkgRoot,
    null,
    null,
    false, // Must be false, do not run 'vcpkg install'.
    false, // Must be false
    [],
    "**/vcpkg.json/", // vcpkg.json glob
    [], // vcpkg.json glob ignores
    "/path/to/vcpkgconfigurationjson", // vcpkg-configuration.json glob
    null);

  // Act.
  // HACK: 'any' to access private fields.
  let vcpkgBuildMock = jest.spyOn(vcpkg as any, 'build');
  try {
    await vcpkg.run();
  }
  catch (error) {
    throw new Error(`run must have succeeded, instead it failed: ${error as Error} \n ${(error as Error)?.stack}`);
  }

  // Assert.
  expect(mock.exportedBaselib.warning).toHaveBeenCalledTimes(0);
  expect(mock.exportedBaselib.error).toHaveBeenCalledTimes(0);
  expect(vcpkgBuildMock).toHaveBeenCalledTimes(1);
});

testutils.testWithHeader('run-vcpkg must pick up vcpkg.json baseline (from "vcpkg-configuration" object) and build and run successfully', async () => {
  let installRoot: string = await runvcpkgutils.getDefaultVcpkgInstallDirectory(baseUtil.baseLib);
  if (baseUtil.isWin32()) {
    installRoot = 'c:\\github\\workspace\\on\\windows\\';
    process.env[globals.VCPKG_INSTALLED_DIR] = installRoot;
  }

  mock.answersMocks.reset(answers);

  const vcpkgJsonContent = 
`{
    "vcpkg-configuration": {
      "default-registry": {
        "kind": "builtin",
        "baseline": "${vcpkgBaselineCommitId}"
      }
    }
  }
`;
  
jest.spyOn(utils.BaseUtilLib.prototype, 'readFile').mockImplementation(
    function (this: utils.BaseUtilLib, file: string): string {
      if (testutils.areEqualVerbose(file, vcpkgJsonFile)) {
        return vcpkgJsonContent;
      }
      else
        throw `readFile called with unexpected file name: '${file}'.`;
    });
  
  let vcpkg = await VcpkgRunner.create(
    baseUtil,
    vcpkgRoot,
    null,
    null,
    false, // Must be false, do not run 'vcpkg install'.
    false, // Must be false
    [],
    "**/vcpkg.json/", // vcpkg.json glob
    [], // vcpkg.json glob ignores
    "/path/to/vcpkgconfigurationjson", // vcpkg-configuration.json glob
    null);

  // Act.
  // HACK: 'any' to access private fields.
  let vcpkgBuildMock = jest.spyOn(vcpkg as any, 'build');
  try {
    await vcpkg.run();
  }
  catch (error) {
    throw new Error(`run must have succeeded, instead it failed: ${error as Error} \n ${(error as Error)?.stack}`);
  }

  // Assert.
  expect(mock.exportedBaselib.warning).toHaveBeenCalledTimes(0);
  expect(mock.exportedBaselib.error).toHaveBeenCalledTimes(0);
  expect(vcpkgBuildMock).toHaveBeenCalledTimes(1);
});
