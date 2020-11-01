// Copyright (c) 2019-2020 Luca Cappa
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
const vcpkgRoot = '/path/to/vcpkg';
const cmakeExePath = '/usr/bin/cmake';
const ninjaExePath = '/usr/bin/ninja';
const prefix = isWin ? "cmd.exe /c " : "/bin/bash -c ";
const cmakeListsTxtPath = path.join('/home/user/project/src/path/', 'CMakeLists.txt');

jest.spyOn(utils.BaseUtilLib.prototype, 'readFile').mockImplementation(
  function (this: utils.BaseUtilLib, file: string): [boolean, string] {
    if (testutils.areEqualVerbose(file, path.join(vcpkgRoot, '.artifactignore'))) {
      return [true, "!.git\n"];
    }
    else if (testutils.areEqualVerbose(file, path.join(vcpkgRoot, globals.cmakeAppendedArgs))) {
      return [true, oldGitRef];
    }
    else
      throw `readFile called with unexpected file name: '${file}'.`;
  });

/*
jest.spyOn(utils.BaseUtilLib.prototype, 'setEnvVar').mockImplementation(
function (this: utils.BaseUtilLib, name: string, value: string): void {
  // Ensure they are not set twice.
  const existingValue: string = mock.envVarSetDict[name];
  if (existingValue) {
    assert.fail(`Error: env var ${name} is set multiple times!`);
  }

  // Ensure their values are the expected ones.
  if (name === utils.BaseUtilLib.cachingFormatEnvName) {
    assert.equal(value, "Files");
  } else if (name === globals.buildDirectory) {
    assert.equal(value, vcpkgRoot);
  } else if (name === globals.outVcpkgTriplet) {
    // no check on value here...
  } else if (name === globals.vcpkgRoot) {
    // no check on value here...
  } else {
    assert.fail(`Unexpected variable name: '${name}'`);
  }
});
*/
import { CMakeRunner } from '../src/cmake-runner';

mock.inputsMocks.setInput(globals.cmakeListsOrSettingsJson, 'CMakeListsTxtBasic');
mock.inputsMocks.setBooleanInput(globals.buildWithCMake, true);
mock.inputsMocks.setInput(globals.cmakeGenerator, 'Ninja');
mock.inputsMocks.setInput(globals.cmakeBuildType, 'Release');
mock.inputsMocks.setInput(globals.cmakeListsTxtPath, cmakeListsTxtPath)

testutils.testWithHeader('run-cmake must configure and build successfully', async () => {
  const answers: testutils.BaseLibAnswers = {
    "exec": {
      [`${gitPath}`]:
        { code: 0, stdout: "git output" },
      [`${cmakeExePath} -GNinja -DCMAKE_MAKE_PROGRAM=${ninjaExePath} -DCMAKE_BUILD_TYPE=Release ${path.dirname(cmakeListsTxtPath)}`]: { 'code': 0, "stdout": 'cmake output here' },
      [`${cmakeExePath} --build .`]: { 'code': 0, "stdout": 'cmake --build output here' },
      [gitPath]: { 'code': 0, 'stdout': 'git output here' },
    },
    "exist": { [vcpkgRoot]: true },
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
