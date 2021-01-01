// Copyright (c) 2020-2021 Luca Cappa
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
const cmakeSettingsJsonPath = path.join('/home/user/project/src/path/', 'CMakeLists.txt');
const buildDirectory = '/path/to/build/dir/';

function provideCMakeSettingsJsonFile(): string {
  const retVal: any = {
    'environments': [
      { 'globalENVVAR': 'globalENVVALUE' }, {
        'environment': 'globalENVNAME',
        'namespace': 'namespace',
        'globalLOCALAPPDATA': 'globalLOCALAPPDATAresolved'
      },
    ],
    'configurations': [
      {
        'environments': [
          { 'ENVVAR': 'ENVVALUE' }, {
            'environment': 'ENVNAME',
            'namespace': 'namespace',
            'LOCALAPPDATA': 'LOCALAPPDATAresolved'
          },
          {
            'namespace': '',
            'CONFIGURATIONTYPE': 'MinSizeRel'
          }
        ],
        'name': 'x64-ReleaseVS',
        'generator': 'Visual Studio 16 2019 Win64',
        'configurationType': '${CONFIGURATIONTYPE}',
        'inheritEnvironments': ["ENVNAME"],
        'buildRoot':
          '${env.ENVVAR}\\${namespace.LOCALAPPDATA}\\CMakeBuild\\${workspaceHash}\\build\\${name}',
        'cmakeCommandArgs': '',
        'buildCommandArgs': '-m -v:minimal',
        'variables': [
          {
            'name': 'CMAKE_TOOLCHAIN_FILE',
            'value': 'D:/src/vcpkg/scripts/buildsystems/vcpkg.cmake'
          },
          {
            'name': 'CMAKE_MSBUILD_VS_FLAG',
            'value': 'ON',
            'type': 'boolean'
          }
        ]
      },
      {
        'environments': [
          { 'ENVVAR': 'ENVVALUE' }, {
            'environment': 'ENVNAME',
            'namespace': 'namespace',
            'LOCALAPPDATA': 'LOCALAPPDATAresolved',
            'deref': '${namespace.varname}',
            'varname': 'derefValue'
          },
          {
            'namespace': '',
            'CONFIGURATION': 'ResolvedConfiguration'
          }
        ],
        'name': 'Linux-Debug',
        'generator': 'Ninja',
        'configurationType': 'Debug',
        'inheritEnvironments': ["ENVNAME", "globalENVNAME"],
        'buildRoot':
          '${env.globalENVVAR}/${env.ENVVAR}/${namespace.globalLOCALAPPDATA}/${namespace.deref}/build/${name}',
        'cmakeCommandArgs': '',
        'buildCommandArgs': '-make -build -args',
        'variables': [{
          'name': 'CMAKE_ANY_FLAG',
          'value': 'OFF',
          'type': 'boolean'
        },
        {
          'name': 'CONFIGURATION',
          'value': '${CONFIGURATION}',
          'type': 'STRING'
        }]
      }]
  };
  return JSON.stringify(retVal);
}

jest.spyOn(utils.BaseUtilLib.prototype, 'readFile').mockImplementation(
  function (this: utils.BaseUtilLib, file: string): [boolean, string] {
    if (testutils.areEqualVerbose(file, path.join(vcpkgRoot, '.artifactignore'))) {
      return [true, "!.git\n"];
    }
    else if (testutils.areEqualVerbose(file, path.join(vcpkgRoot, globals.cmakeAppendedArgs))) {
      return [true, oldGitRef];
    }
    else if (testutils.areEqualVerbose(file, cmakeSettingsJsonPath)) {
      return [true, provideCMakeSettingsJsonFile()];
    }
    else if (testutils.areEqualVerbose(file, path.join(buildDirectory, "CMakeCache.txt"))) {
      return [true, `CMAKE_CXX_COMPILER:${isWin ? "msvc" : "gcc"}`]
    }
    else
      throw `readFile called with unexpected file name: '${file}'.`;
  });

import { CMakeRunner } from '../src/cmake-runner';

mock.inputsMocks.setInput(globals.cmakeListsOrSettingsJson, 'CMakeSettingsJson');
mock.inputsMocks.setInput(globals.cmakeSettingsJsonPath, cmakeSettingsJsonPath);
mock.inputsMocks.setInput(globals.configurationRegexFilter, '(.*VS|Linux.*)');
mock.inputsMocks.setInput(globals.buildWithCMake, 'true');
mock.inputsMocks.setInput(globals.buildWithCMakeArgs, 'this must be unused');
mock.inputsMocks.setInput(globals.buildDirectory, buildDirectory);
mock.inputsMocks.setInput(globals.useVcpkgToolchainFile, "false");
process.env["Build.BinariesDirectory"] = "/agent/w/1/b/";
process.env.RUNVCPKG_VCPKG_ROOT = "/vcpkg/root/";

testutils.testWithHeader('run-cmake must successfully run with complex cmakesettings.json file', async () => {
  const answers: testutils.BaseLibAnswers = {
    "exec": {
      [`${gitPath}`]:
        { code: 0, stdout: "git output" },
      [`${cmakeExePath} -GVisual Studio 16 2019 -Ax64 -DCMAKE_TOOLCHAIN_FILE:string=D:/src/vcpkg/scripts/buildsystems/vcpkg.cmake -DCMAKE_MSBUILD_VS_FLAG:boolean=ON ${path.dirname(cmakeSettingsJsonPath)}`]: { 'code': 0, "stdout": 'cmake output here' },
      [`${cmakeExePath} --build . --config MinSizeRel -- -m -v:minimal`]:
        { 'code': 0, 'stdout': 'cmake build output here' },
      [`${cmakeExePath} -GNinja -DCMAKE_MAKE_PROGRAM=${ninjaExePath} -DCMAKE_BUILD_TYPE=Debug -DCMAKE_ANY_FLAG:boolean=OFF -DCONFIGURATION:STRING=ResolvedConfiguration ${path.dirname(cmakeSettingsJsonPath)}`]: { 'code': 0, "stdout": 'cmake output here' },
      [`${cmakeExePath} --build . -- -make -build -args`]: { 'code': 0, "stdout": 'cmake --build output here' },
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
  // HACK: any to access private fields.
  let cmakeBuildMock = jest.spyOn(CMakeRunner as any, 'build');

  // Act and Assert.
  const cmake: CMakeRunner = new CMakeRunner(mock.exportedBaselib);
  try {
    await cmake.run();
  }
  catch (error) {
    throw new Error(`run must have succeeded, instead it failed: ${error} \n ${error.stack} `);
  }
  expect(() => cmake.run()).rejects.toThrowError();
  expect(mock.exportedBaselib.warning).toBeCalledTimes(0);
  expect(mock.exportedBaselib.error).toBeCalledTimes(0);
  expect(cmakeBuildMock).toBeCalledTimes(2);// Two CMakeSettings.json configuratinos are being built.
});
