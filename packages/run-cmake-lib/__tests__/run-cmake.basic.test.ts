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
const cpackExePath = '/usr/bin/cpack';
const ninjaExePath = '/usr/bin/ninja';
const cmakeListsTxtPath = path.join('/home/user/project/src/path/', 'CMakeLists.txt');
const cmakePreset = 'cmake';
const buildPreset = 'build';
const testPreset = 'test';
const packagePreset = 'package';
const configureAddedArg = "-DVARIABLE=VALUECONFIGURE";
const buildAddedArg = "-DVARIABLE=VALUEBUILD";
const packageAddedArg = "-DVARIABLE=VALUEPACKAGE";
const testAddedArg = "-DVARIABLE=VALUETEST";

import { CMakeRunner } from '../src/cmake-runner';

mock.inputsMocks.setInput(globals.cmakeListsTxtPath, cmakeListsTxtPath);

testutils.testWithHeader('run-cmake must configure, build, test and package successfully', async () => {
  const answers: testutils.BaseLibAnswers = {
    "exec": {
      [`${gitPath}`]:
        { code: 0, stdout: "git output" },
      [`${cmakeExePath} --preset ${cmakePreset} ${configureAddedArg}`]: { 'code': 0, "stdout": 'cmake --preset output here' },
      [`${cmakeExePath} --build --preset ${buildPreset} ${buildAddedArg}`]: { 'code': 0, "stdout": 'cmake --build --preset output here' },
      [`${ctestExePath} --preset ${testPreset} ${testAddedArg}`]: { 'code': 0, "stdout": 'ctest --preset output here' },
      [`${cpackExePath} --preset ${packagePreset} ${packageAddedArg}`]: { 'code': 0, "stdout": 'cpack --preset output here' },
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
      'cpack': cpackExePath,
      'ninja': ninjaExePath
    },
  };
  mock.answersMocks.reset(answers);

  // Act.
  try {
    await CMakeRunner.run(
      mock.exportedBaselib,
      undefined,
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
      packagePreset,
      undefined,
      `['${packageAddedArg}']`,
    );
  }
  catch (error) {
    throw new Error(`run must have succeeded, instead it failed: ${error as Error} \n ${(error as Error)?.stack}`);
  }

  // Assert.
  expect(mock.exportedBaselib.warning).toBeCalledTimes(0);
  expect(mock.exportedBaselib.error).toBeCalledTimes(0);
});
