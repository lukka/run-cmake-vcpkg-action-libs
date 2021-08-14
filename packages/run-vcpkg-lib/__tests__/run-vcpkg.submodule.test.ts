// Copyright (c) 2019-2020-2021 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as globals from '../src/vcpkg-globals'
import * as testutils from './utils'
import * as path from 'path'
import * as mock from './mocks'
import * as assert from 'assert'
import * as utils from '@lukka/base-util-lib';

// Arrange.
const isWin = process.platform === "win32";
const gitRef = '1ee7567890123456789012345678901234567890'
const gitPath = '/usr/local/bin/git';
const vcpkgRoot = '/path/to/vcpkg';
const prefix = isWin ? "cmd.exe /c " : "/bin/bash -c ";
const bootstrapName = isWin ? "bootstrap-vcpkg.bat" : "bootstrap-vcpkg.sh";
const vcpkgExeName = isWin ? "vcpkg.exe" : "vcpkg";
const vcpkgExePath = path.join(vcpkgRoot, vcpkgExeName);

mock.VcpkgMocks.isVcpkgSubmodule = true;
mock.VcpkgMocks.vcpkgRoot = vcpkgRoot;
mock.VcpkgMocks.vcpkgExePath = vcpkgExePath;

jest.spyOn(utils.BaseUtilLib.prototype, 'readFile').mockImplementation(
  function (this: utils.BaseUtilLib, file: string): string {
    if (testutils.areEqualVerbose(file, path.join(vcpkgRoot, globals.vcpkgLastBuiltCommitId))) {
      return gitRef;
    }
    else
      throw `readFile called with unexpected file name: '${file}'.`;
  });

jest.spyOn(utils.BaseUtilLib.prototype, 'setEnvVar').mockImplementation(
  function (this: utils.BaseUtilLib, name: string, value: string): void {
    // Ensure they are not set twice.
    const existingValue: string = mock.envVarSetDict[name];
    if (existingValue) {
      assert.fail(`Error: env var ${name} is set multiple times!`);
    }

    // Ensure their values are the expected ones.
    if (name === globals.outVcpkgRootPath) {
      assert.strictEqual(value, vcpkgRoot);
    } else if (name === globals.vcpkgRoot) {
      // no check on value here...
    } else {
      assert.fail(`Unexpected variable name: '${name}'`);
    }
  });

import { VcpkgRunner } from '../src/vcpkg-runner';

mock.inputsMocks.setInput(globals.vcpkgCommitId, gitRef);
mock.inputsMocks.setInput(globals.vcpkgDirectory, vcpkgRoot);
mock.inputsMocks.setBooleanInput(globals.doNotUpdateVcpkg, false);

testutils.testWithHeader('run-vcpkg with vcpkg as submodule must build successfully', async () => {
  const answers: testutils.BaseLibAnswers = {
    "exec": {
      // Action must not call any git clone operation, only to check the submodule status.
      [`${gitPath}`]:
        { code: 0, stdout: "git output" },
      [`${gitPath} rev-parse HEAD`]:
        { code: 0, stdout: gitRef },
      [`${gitPath} submodule`]:
        { 'code': 0, 'stdout': 'this is git submodule output' },
      [`${gitPath} submodule status ${vcpkgRoot}`]:
        { 'code': 0, stdout: 'this is git submodule output' },
      [`${path.join(vcpkgRoot, vcpkgExeName)} version`]:
        { 'code': 0, 'stdout': 'this is the "vcpkg version" output with exit code=0' },
      [`chmod +x ${path.join(vcpkgRoot, "vcpkg")}`]:
        { 'code': 0, 'stdout': 'chmod output here' },
      [`chmod +x ${path.join(vcpkgRoot, "bootstrap-vcpkg.sh")}`]:
        { 'code': 0, 'stdout': 'this is the output of chmod +x bootstrap' },
      [`${prefix}${path.join(vcpkgRoot, bootstrapName)}`]:
        { 'code': 0, 'stdout': 'this is the output of bootstrap-vcpkg' }
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

  // Act.
  const vcpkg: VcpkgRunner = new VcpkgRunner(mock.exportedBaselib);
  try {
    await vcpkg.run();
  }
  catch (error) {
    throw new Error(`run must have succeeded, instead it failed: ${error} \n ${error.stack}`);
  }

  // Assert.

  // 1 warning about the GitCommitId input provided, that is not needed (and ignored) when using vcpkg as a submodule.
  expect(mock.exportedBaselib.warning).toBeCalledTimes(1);
  expect(mock.exportedBaselib.error).toBeCalledTimes(0);
});
