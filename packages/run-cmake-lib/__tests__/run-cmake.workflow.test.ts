// Copyright (c) 2019-2020-2021-2022-2023 Luca Cappa
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
const cmakeListsTxtPath = path.join('/home/user/project/src/path/', 'CMakeLists.txt');
const cmakePreset = 'cmake';
const buildPreset = 'build';
const testPreset = 'test';
const configureAddedArg = "-DVARIABLE=VALUECONFIGURE";
const buildAddedArg = "-DVARIABLE=VALUEBUILD";
const testAddedArg = "-DVARIABLE=VALUETEST";
const workflowPreset = "MyWorkflow";

import { CMakeRunner } from '../src/cmake-runner';

mock.inputsMocks.setInput(globals.cmakeListsTxtPath, cmakeListsTxtPath);

testutils.testWithHeader('run-cmake must run the workflow successfully', async () => {
  const answers: testutils.BaseLibAnswers = {
    "exec": {
      [`${gitPath}`]:
        { code: 0, stdout: "git output" },
      [`${cmakeExePath} --workflow --preset ${workflowPreset} --fresh`]: { 'code': 0, "stdout": 'cmake --workflow --preset output here' },
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

  // Act.
  try {
    await CMakeRunner.run(
      mock.exportedBaselib,
      workflowPreset,
      undefined,
      cmakePreset,
      undefined,
      `['${configureAddedArg}']`,
      buildPreset,
      undefined,
      `['${buildAddedArg}']`,
      testPreset,
      undefined,
      `['${testAddedArg}']`,
      );
  }
  catch (error) {
    throw new Error(`run must have succeeded, instead it failed: ${error} \n ${error.stack}`);
  }

  // Assert.
  expect(mock.exportedBaselib.warning).toBeCalledTimes(0);
  expect(mock.exportedBaselib.error).toBeCalledTimes(0);
});
