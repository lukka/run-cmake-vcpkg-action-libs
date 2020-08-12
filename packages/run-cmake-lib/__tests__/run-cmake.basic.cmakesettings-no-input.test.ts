// Copyright (c) 2020 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as globals from '../src/cmake-globals'
import * as testutils from '../../run-vcpkg-lib/__tests__/utils'
import * as path from 'path'
import * as mock from '../../run-vcpkg-lib/__tests__/mocks'
import * as utils from '@lukka/base-lib';

// Arrange.
const isWin = process.platform === "win32";
const oldGitRef = 'gitref';
const gitPath = '/usr/local/bin/git';
const vcpkgRoot = '/path/to/vcpkg';
const cmakeExePath = '/usr/bin/cmake';
const ninjaExePath = '/usr/bin/ninja';
const prefix = isWin ? "cmd.exe /c " : "/bin/bash -c ";
const cmakeListsTxtPath = path.join('/home/user/project/src/path/', 'CMakeLists.txt');

jest.spyOn(utils.BaseLibUtils.prototype, 'readFile').mockImplementation(
  function (this: utils.BaseLibUtils, file: string): [boolean, string] {
    if (testutils.areEqualVerbose(file, path.join(vcpkgRoot, '.artifactignore'))) {
      return [true, "!.git\n"];
    }
    else if (testutils.areEqualVerbose(file, path.join(vcpkgRoot, globals.cmakeAppendedArgs))) {
      return [true, oldGitRef];
    }
    else
      throw `readFile called with unexpected file name: '${file}'.`;
  });

import { CMakeRunner } from '../src/cmake-runner';

mock.inputsMocks.setInput(globals.cmakeListsOrSettingsJson, 'CMakeListsTxtBasic');

testutils.testWithHeader('run-cmake must fail when the required input is not provided', async () => {
  const answers: testutils.TaskLibAnswers = {
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

  // Assert.
  expect(() => cmake.run()).rejects.toThrowError();
  expect(mock.exportedBaselib.warning).toBeCalledTimes(0);
  expect(mock.exportedBaselib.error).toBeCalledTimes(0);
});
