// Copyright (c) 2020-2021-2022-2023 Luca Cappa
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
const vcpkgRoot = path.join('/path/to/', 'vcpkg');
const cmakeExePath = '/usr/bin/cmake';
const ninjaExePath = '/usr/bin/ninja';
const vcpkgExeName = isWin ? "vcpkg.exe" : "vcpkg";
const vcpkgExePath = path.join(vcpkgRoot, vcpkgExeName);
const prefix = isWin ? "cmd.exe /c " : "/bin/bash -c ";
const cmakeListsTxtPath = path.join('/home/user/project/src/path/', 'CMakeLists.txt');
const ctestExePath = '/usr/bin/ctest';
const cmakePreset = 'cmake';
const buildPreset = 'build';
const testPreset = 'test';

import { CMakeRunner } from '../src/cmake-runner';
import * as cmakeutils from '../src/cmake-utils'

mock.inputsMocks.setInput(globals.cmakeListsTxtPath, cmakeListsTxtPath);

testutils.testWithHeader('run-cmake with VCPKG_ROOT defined must configure and build and test successfully', async () => {
  process.env.VCPKG_ROOT = vcpkgRoot;
  const answers: testutils.BaseLibAnswers = {
    "exec": {
      [`${gitPath}`]:
        { code: 0, stdout: "git output" },
      [`${cmakeExePath} --preset ${cmakePreset}`]: { 'code': 0, "stdout": 'cmake --preset output here' },
      [`${cmakeExePath} --build --preset ${buildPreset}`]: { 'code': 0, "stdout": 'cmake --build --preset output here' },
      [`${ctestExePath} --preset ${testPreset}`]: { 'code': 0, "stdout": 'ctest --preset output here' },
      [gitPath]: { 'code': 0, 'stdout': 'git output here' },
      [`${ctestExePath} --preset ${testPreset}`]: { 'code': 0, "stdout": 'ctest --preset output here' },
      [`${vcpkgExePath} env --bin --include --tools --python --triplet x64-windows set`]: { 'code': 0, "stdout": 'vcpkg env output here.' }
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
  delete process.env.CC;
  delete process.env.CXX;

  const setupEnvVcpkg = jest.spyOn(cmakeutils, 'injectEnvVariables');

  // Act and Assert.
  try {
    await CMakeRunner.run(mock.exportedBaselib, 
      undefined, undefined,
      cmakePreset, undefined, undefined,
      buildPreset, undefined, undefined,
      testPreset, undefined, undefined);
  }
  catch (error) {
    throw new Error(`run must have succeeded, instead it failed: ${error} \n ${error.stack}`);
  }

  expect(mock.exportedBaselib.warning).toBeCalledTimes(0);
  expect(mock.exportedBaselib.error).toBeCalledTimes(0);
  expect(setupEnvVcpkg).toBeCalledTimes(isWin ? 1 : 0);
  setupEnvVcpkg.mockRestore();

  expect(isWin ? process.env['CXX'] : true).toBeTruthy();
  expect(isWin ? process.env['CC'] : true).toBeTruthy();
});

testutils.testWithHeader('run-cmake with VCPKG_ROOT not defined must configure and build and test successfully', async () => {
  delete process.env.VCPKG_ROOT;
  const answers: testutils.BaseLibAnswers = {
    "exec": {
      [`${gitPath}`]:
        { code: 0, stdout: "git output" },
      [`${cmakeExePath} --preset ${cmakePreset}`]: { 'code': 0, "stdout": 'cmake --preset output here' },
      [`${cmakeExePath} --build --preset ${buildPreset}`]: { 'code': 0, "stdout": 'cmake --build --preset output here' },
      [`${ctestExePath} --preset ${testPreset}`]: { 'code': 0, "stdout": 'ctest --preset output here' },
      [gitPath]: { 'code': 0, 'stdout': 'git output here' },
      [`${ctestExePath} --preset ${testPreset}`]: { 'code': 0, "stdout": 'ctest --preset output here' },
      [`${vcpkgExePath} env --bin --include --tools --python --triplet x64-windows set`]: { 'code': 0, "stdout": 'vcpkg env output here.' }
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

  delete process.env.CC;
  delete process.env.CXX;

  const setupEnvVcpkg = jest.spyOn(cmakeutils, 'injectEnvVariables');
  // Act and Assert.
  try {
    await CMakeRunner.run(mock.exportedBaselib);
  }
  catch (error) {
    throw new Error(`run must have succeeded, instead it failed: ${error} \n ${error.stack}`);
  }

  expect(mock.exportedBaselib.warning).toBeCalledTimes(0);
  expect(mock.exportedBaselib.error).toBeCalledTimes(0);
  expect(setupEnvVcpkg).toBeCalledTimes(0);
  setupEnvVcpkg.mockRestore();

  // Since VCPKG_ROOT is not defined, CC and CXX will not be set.
  expect(isWin ? process.env['CXX'] : false).toBeFalsy();
  expect(isWin ? process.env['CC'] : false).toBeFalsy();
});
