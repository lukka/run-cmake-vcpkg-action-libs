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

import { CMakeRunner } from '../src/cmake-runner';
import * as cmakeutils from '../src/utils'

mock.inputsMocks.setInput(globals.cmakeListsOrSettingsJson, 'CMakeListsTxtAdvanced');
mock.inputsMocks.setInput(globals.cmakeListsTxtPath, cmakeListsTxtPath);
mock.inputsMocks.setInput(globals.ninjaPath, ninjaExePath);
mock.inputsMocks.setInput(globals.buildDirectory, 'buildDirPath');
mock.inputsMocks.setBooleanInput(globals.buildWithCMake, true);
mock.inputsMocks.setInput(globals.buildWithCMakeArgs, '-cmake -build -args');
mock.inputsMocks.setInput(globals.buildDirectory, '/path/to/build/dir/');
mock.inputsMocks.setInput(globals.cmakeAppendedArgs, '-GNinja -DVCPKG_CHAINLOAD_TOOLCHAIN_FILE=/existing/tool/chain.cmake');

mock.inputsMocks.setBooleanInput(globals.useVcpkgToolchainFile, true);
mock.inputsMocks.setInput(globals.cmakeToolchainPath, cmakeListsTxtPath)
process.env.RUNVCPKG_VCPKG_ROOT = vcpkgRoot;
const vcpkgToolchainFile = path.join(vcpkgRoot, 'scripts/buildsystems/vcpkg.cmake');

testutils.testWithHeader('run-cmake basic mode with toolchain must configure and build successfully', async () => {
  const answers: testutils.BaseLibAnswers = {
    "exec": {
      [`${gitPath}`]:
        { code: 0, stdout: "git output" },
      [`${cmakeExePath} -DCMAKE_MAKE_PROGRAM=${ninjaExePath} -GNinja -DVCPKG_CHAINLOAD_TOOLCHAIN_FILE=/existing/tool/chain.cmake -DCMAKE_TOOLCHAIN_FILE=${vcpkgToolchainFile} ${path.dirname(cmakeListsTxtPath)}`]: { 'code': 0, "stdout": 'cmake output here' },
      [`${cmakeExePath} --build . -cmake -build -args`]: { 'code': 0, "stdout": 'cmake --build output here' },
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
});
