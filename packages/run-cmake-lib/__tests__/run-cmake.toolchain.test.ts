// Copyright (c) 2020-2021 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as globals from '../src/cmake-globals'
import * as testutils from '../../run-vcpkg-lib/__tests__/utils'
import * as path from 'path'
import * as mock from '../../run-vcpkg-lib/__tests__/mocks'
import * as assert from 'assert'
import * as utils from '@lukka/base-util-lib';

// Arrange.
const isWin = process.platform === "win32";
const oldGitRef = 'gitref';
const gitPath = '/usr/local/bin/git';
const vcpkgRoot = path.join('/path/to/', 'vcpkg');
const cmakeExePath = '/usr/bin/cmake';
const ninjaExePath = '/usr/bin/ninja';
const prefix = isWin ? "cmd.exe /c " : "/bin/bash -c ";
const cmakeListsTxtPath = path.join('/home/user/project/src/path/', 'CMakeLists.txt');
const ctestExePath = '/usr/bin/ctest';
const cmakePreset = 'cmake';
const buildPreset = 'build';
const testPreset = 'test';

import { CMakeRunner } from '../src/cmake-runner';
import * as cmakeutils from '../src/utils'

mock.inputsMocks.setInput(globals.cmakeListsTxtPath, cmakeListsTxtPath);
mock.inputsMocks.setInput(globals.configurePreset, cmakePreset);
mock.inputsMocks.setInput(globals.buildPreset, buildPreset);
mock.inputsMocks.setInput(globals.testPreset, testPreset);
// Setup to inject the vcpkg toolchain.
mock.inputsMocks.setBooleanInput(globals.useVcpkgToolchainFile, true);
process.env.RUNVCPKG_VCPKG_ROOT = vcpkgRoot;
const vcpkgToolchainFile = path.join(vcpkgRoot, 'scripts/buildsystems/vcpkg.cmake');

testutils.testWithHeader('run-cmake with toolchain must configure and build and test successfully', async () => {
  const answers: testutils.BaseLibAnswers = {
    "exec": {
      [`${gitPath}`]:
        { code: 0, stdout: "git output" },
      [`${cmakeExePath} --preset ${cmakePreset} -DCMAKE_TOOLCHAIN_FILE=${vcpkgToolchainFile}`]: { 'code': 0, "stdout": 'cmake --preset output here' },
      [`${cmakeExePath} --build --preset ${buildPreset}`]: { 'code': 0, "stdout": 'cmake --build --preset output here' },
      [`${ctestExePath} --preset ${testPreset}`]: { 'code': 0, "stdout": 'ctest --preset output here' },
      [gitPath]: { 'code': 0, 'stdout': 'git output here' },
    },
    "exist": { [vcpkgRoot]: true },
    'which': {
      'git': '/usr/local/bin/git',
      'sh': '/bin/bash',
      'chmod': '/bin/chmod',
      'cmd.exe': 'cmd.exe',
      'cmake': cmakeExePath,
      'ctest': ctestExePath,
      'ninja': ninjaExePath
    },
  };
  mock.answersMocks.reset(answers);

  const injectVcpkgMock = jest.spyOn(cmakeutils.CMakeUtils.prototype, 'injectVcpkgToolchain');
  // Act and Assert.
  const cmake: CMakeRunner = new CMakeRunner(mock.exportedBaselib);
  try {
    await cmake.run();
  }
  catch (error) {
    throw new Error(`run must have succeeded, instead it failed: ${error} \n ${error.stack}`);
  }

  expect(mock.exportedBaselib.warning).toBeCalledTimes(0);
  expect(mock.exportedBaselib.error).toBeCalledTimes(0);
  expect(injectVcpkgMock).toBeCalledTimes(1);
  injectVcpkgMock.mockRestore();
});
