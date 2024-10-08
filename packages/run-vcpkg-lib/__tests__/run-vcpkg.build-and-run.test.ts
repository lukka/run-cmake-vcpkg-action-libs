// Copyright (c) 2019-2020-2021-2022-2023-2024 Luca Cappa
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
const newGitRef = '1ee7567890123456789012345678901234567890'
const oldGitRef = '01d4567890123456789012345678901234567890';
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

jest.spyOn(utils.BaseUtilLib.prototype, 'readFile').mockImplementation(
  function (this: utils.BaseUtilLib, file: string): string {
    if (testutils.areEqualVerbose(file, path.join(vcpkgRoot, globals.vcpkgLastBuiltCommitId))) {
      return oldGitRef;
    } else {
      throw `readFile called with unexpected file name: '${file}'.`;
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

testutils.testWithHeader('run-vcpkg must build and run successfully', async () => {
  let installRoot: string = await runvcpkgutils.getDefaultVcpkgInstallDirectory(baseUtil.baseLib);
  if (baseUtil.isWin32()) {
    installRoot = 'c:\\github\\workspace\\on\\windows\\';
    process.env[globals.VCPKG_INSTALLED_DIR] = installRoot;
  }

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
      [`${gitPath} checkout --force ${newGitRef}`]:
        { 'code': 0, 'stdout': `this is git checkout ${newGitRef} output` },
      [`chmod +x ${path.join(vcpkgRoot, "vcpkg")}`]:
        { 'code': 0, 'stdout': 'chmod output here' },
      [`chmod +x ${path.join(vcpkgRoot, "bootstrap-vcpkg.sh")}`]:
        { 'code': 0, 'stdout': 'this is the output of chmod +x bootstrap' },
      [`${prefix}${path.join(vcpkgRoot, bootstrapName)}`]:
        { 'code': 0, 'stdout': 'this is the output of bootstrap-vcpkg' },
      [`${path.join(vcpkgRoot, vcpkgExeName)} install --recurse --clean-after-build --x-install-root ${installRoot} --triplet ${baseUtil.getDefaultTriplet()}`]:
        { 'code': 0, 'stdout': 'this is the `vcpkg install` output' },
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
  mock.answersMocks.reset(answers);

  let vcpkg = await VcpkgRunner.create(
    baseUtil,
    vcpkgRoot,
    null,
    newGitRef,
    true, // Must be true
    false, // Must be false
    [],
    "**/vcpkg.json/",
    [],
    null,
    null);

  // Act.
  // HACK: 'any' to access private fields.
  let vcpkgBuildMock = jest.spyOn(vcpkg as any, 'build');
  try {
    await vcpkg.run();
  } catch (error) {
    throw new Error(`run must have succeeded, instead it failed: ${error as Error} \n ${(error as Error)?.stack}`);
  }

  // Assert.
  expect(mock.exportedBaselib.warning).toHaveBeenCalledTimes(0);
  expect(mock.exportedBaselib.error).toHaveBeenCalledTimes(0);
  expect(vcpkgBuildMock).toHaveBeenCalledTimes(1);
});
