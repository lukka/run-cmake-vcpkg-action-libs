// Copyright (c) 2019-2020 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as globals from '../src/cmake-globals'
import * as testutils from '../../run-vcpkg-lib/__tests__/utils'
import * as path from 'path'
import * as mock from '../../run-vcpkg-lib/__tests__/mocks'
import * as ninja from '../src/ninja'
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

testutils.testWithHeader('ninja: it must be downloaded successfully', async () => {
  const answers: testutils.BaseLibAnswers = {
    "exec": {
      "chmod": { code: 0 }
    },
    "exist": { [vcpkgRoot]: true },
    'which': {
      'git': '/usr/local/bin/git',
      'sh': '/bin/bash',
      'chmod': '/bin/chmod',
      'cmd.exe': 'cmd.exe',
      'cmake': cmakeExePath,
      // Provide a non existent path for ninja to force its download code path.
      'ninja': ""
    },
  };
  mock.answersMocks.reset(answers);

  // Act and Assert.
  // 
  const ninjaDownloader: ninja.NinjaProvider = new ninja.NinjaProvider(mock.exportedBaselib);
  try {
    await ninjaDownloader.retrieveNinjaPath(/*no input provided*/"", "");
  }
  catch (error) {
    throw new Error(`run must have succeeded, instead it failed: ${error} \n ${error.stack}`);
  }
});

testutils.testWithHeader('ninja: when explicitly provided, that must be returned.', async () => {
  const ninjaDownloader: ninja.NinjaProvider = new ninja.NinjaProvider(mock.exportedBaselib);
  // Act and Assert.
  const dummyNinja = "dummy/path/for/ninja";
  const ninjaPath = await ninjaDownloader.retrieveNinjaPath(dummyNinja, "");
  expect(ninjaPath).toStrictEqual(dummyNinja);
});
