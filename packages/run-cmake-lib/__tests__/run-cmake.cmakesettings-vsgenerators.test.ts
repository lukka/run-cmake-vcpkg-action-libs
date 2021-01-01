// Copyright (c) 2019-2020-2021 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as globals from '../src/cmake-globals'
import * as testutils from '../../run-vcpkg-lib/__tests__/utils'
import * as path from 'path'
import * as mock from '../../run-vcpkg-lib/__tests__/mocks'
import * as utils from '@lukka/base-util-lib';

// Arrange.
const isWin = process.platform === "win32";
const oldGitRef = 'gitref';
const gitPath = '/usr/local/bin/git';
const vcpkgRoot = '/path/to/vcpkg';
const cmakeExePath = '/usr/bin/cmake';
const ninjaExePath = '/usr/bin/ninja';
const prefix = isWin ? "cmd.exe /c " : "/bin/bash -c ";
const targetPath = '/home/user/project/src/path/';
const cmakeListsTxtPath = path.join(targetPath, 'CMakeLists.txt');
const cmakeSettingsJsonPath = path.join(targetPath, 'CMakeSettings.json');
const artifactStagingDirectory = "/agent/w/1/a/";

jest.spyOn(utils.BaseUtilLib.prototype, 'readFile').mockImplementation(
  function (this: utils.BaseUtilLib, file: string): [boolean, string] {
    if (testutils.areEqualVerbose(file, path.join(vcpkgRoot, '.artifactignore'))) {
      return [true, "!.git\n"];
    }
    else if (testutils.areEqualVerbose(file, path.join(vcpkgRoot, globals.cmakeAppendedArgs))) {
      return [true, oldGitRef];
    }
    else if (testutils.areEqualVerbose(file, cmakeSettingsJsonPath)) {
      return [true, '{\
        //comment\n\
        "configurations": [{\
        "environments": [{ "envvar": "envvalue"}],\
          "name": "anyName",\
          // I love comments\n\
          "configurationType": "RelWithDebInfo",\
          "generator": "Visual Studio 16 2019 ARM64",\
          "buildRoot": "/build/root/${env.envvar}",\
          "buildCommandArgs": "-cmake -build -args"\
        }]\
      }'];
    }
    else if (testutils.areEqualVerbose(file, path.join(artifactStagingDirectory, "CMakeCache.txt"))) {
      return [true, `CMAKE_C_COMPILER:${isWin ? "msvc" : "gcc"}`]
    }
    else
      throw `readFile called with unexpected file name: '${file}'.`;
  });

import { CMakeRunner } from '../src/cmake-runner';

mock.inputsMocks.setInput(globals.cmakeListsOrSettingsJson, 'CMakeSettingsJson');
mock.inputsMocks.setBooleanInput(globals.buildWithCMake, true);
mock.inputsMocks.setInput(globals.cmakeSettingsJsonPath, cmakeSettingsJsonPath);
mock.inputsMocks.setInput(globals.configurationRegexFilter, 'any.+');
mock.inputsMocks.setInput(globals.buildWithCMakeArgs, 'this must be unused');
mock.inputsMocks.setInput(globals.buildDirectory, artifactStagingDirectory);
process.env["BUILD_ARTIFACTSTAGINGDIRECTORY"] = artifactStagingDirectory;

testutils.testWithHeader('run-cmake using cmakesettings.json and vs generators must configure and build successfully', async () => {
  const answers: testutils.BaseLibAnswers = {
    "exec": {
      [`${gitPath}`]:
        { code: 0, stdout: "git output" },
      [`${cmakeExePath} -GVisual Studio 16 2019 -AARM64 ${path.dirname(cmakeListsTxtPath)}`]: { 'code': 0, "stdout": 'cmake output here' },
      [`${cmakeExePath} --build . --config RelWithDebInfo -- -cmake -build -args`]: { 'code': 0, "stdout": 'cmake --build output here' },
      [gitPath]: { 'code': 0, 'stdout': 'git output here' },
    },
    "exist": {
      [vcpkgRoot]: true,
      [cmakeSettingsJsonPath]: true
    },
    'which': {
      'git': '/usr/local/bin/git',
      'sh': '/bin/bash',
      'chmod': '/bin/chmod',
      'cmd.exe': 'cmd.exe',
      'cmake': cmakeExePath,
      'ninja': ninjaExePath
    },
  };
  mock.answersMocks.reset(answers);

  // Act.
  const cmake: CMakeRunner = new CMakeRunner(mock.exportedBaselib);
  try {
    await cmake.run();
  }
  catch (error) {
    throw new Error(`run must have succeeded, instead it failed: ${error} \n ${error.stack}`);
  }

  // Assert.
  expect(mock.exportedBaselib.warning).toBeCalledTimes(0);
  expect(mock.exportedBaselib.error).toBeCalledTimes(0);
});
