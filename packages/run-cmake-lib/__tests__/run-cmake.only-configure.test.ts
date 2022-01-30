// Copyright (c) 2019-2020-2021-2022 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as globals from '../src/cmake-globals'
import * as testutils from '../../run-vcpkg-lib/__tests__/utils'
import * as path from 'path'
import * as mock from '../../run-vcpkg-lib/__tests__/mocks'

// Arrange.
const isWin = process.platform === "win32";
const oldGitRef = 'gitref';
const gitPath = '/usr/local/bin/git';
const vcpkgRoot = '/path/to/vcpkg';
const cmakeExePath = '/usr/bin/cmake';
const ctestExePath = '/usr/bin/ctest';
const ninjaExePath = '/usr/bin/ninja';
const prefix = isWin ? "cmd.exe /c " : "/bin/bash -c ";
const cmakeListsTxtPath = path.join('/home/user/project/src/path', 'CMakeLists.txt');
const cmakePreset = 'cmake';
const buildPreset = 'build';
const testPreset = 'test';

import { CMakeRunner } from '../src/cmake-runner';

mock.inputsMocks.setInput(globals.cmakeListsTxtPath, cmakeListsTxtPath);
mock.inputsMocks.setInput(globals.configurePreset, cmakePreset);
// Nor Build and nor Test mock.inputsMocks.setInput(globals.buildPreset, null);
// mock.inputsMocks.setInput(globals.testPreset, null);//Disable testing.

testutils.testWithHeader('run-cmake must configure and nor build nor test successfully', async () => {
  const answers: testutils.BaseLibAnswers = {
    "exec": {
      [`${gitPath}`]:
        { code: 0, stdout: "git output" },
      [`${cmakeExePath} --preset ${cmakePreset}`]: { 'code': 0, "stdout": 'cmake --preset output here' },
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
  process.env.RUNVCPKG_VCPKG_ROOT = "/vcpkg/root/";

  // Act.
  try {
    await CMakeRunner.run(mock.exportedBaselib);
  }
  catch (error) {
    throw new Error(`run must have succeeded, instead it failed: ${error} \n ${error.stack}`);
  }

  // Assert.
  expect(mock.exportedBaselib.warning).toBeCalledTimes(0);
  expect(mock.exportedBaselib.error).toBeCalledTimes(0);
});
