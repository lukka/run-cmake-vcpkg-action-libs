// Copyright (c) 2019-2020 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as globals from '../src/vcpkg-globals'
import * as testutils from './utils'
import * as path from 'path'
import * as mock from './mocks'
import * as assert from 'assert'
import * as utils from '@lukka/base-lib';

// Arrange.
const isWin = process.platform === "win32";
const gitRef = 'mygitref'
const gitPath = '/usr/local/bin/git';
const vcpkgRoot = '/path/to/vcpkg';
const vcpkgExeName = isWin ? "vcpkg.exe" : "vcpkg";
const vcpkgExePath = path.join(vcpkgRoot, vcpkgExeName);
const prefix = isWin ? "cmd.exe /c " : "/bin/bash -c ";
const bootstrapName = isWin ? "bootstrap-vcpkg.bat" : "bootstrap-vcpkg.sh";

mock.VcpkgMocks.isVcpkgSubmodule = true;
mock.VcpkgMocks.vcpkgRoot = vcpkgRoot;
mock.VcpkgMocks.vcpkgExePath = vcpkgExePath;
mock.VcpkgMocks.vcpkgExeExists = true;

jest.spyOn(utils.BaseLibUtils.prototype, 'readFile').mockImplementation(
  function (this: utils.BaseLibUtils, file: string): [boolean, string] {
    if (testutils.areEqualVerbose(file, path.join(vcpkgRoot, '.artifactignore'))) {
      return [true, "!.git\n"];
    } else if (testutils.areEqualVerbose(file, path.join(vcpkgRoot, globals.vcpkgLastBuiltCommitId))) {
      return [true, "anothergitref"];
    }
    else
      throw `readFile called with unexpected file name: '${file}'.`;
  });

jest.spyOn(utils.BaseLibUtils.prototype, 'setEnvVar').mockImplementation(
  function (this: utils.BaseLibUtils, name: string, value: string): void {
    // Ensure they are not set twice.
    const existingValue: string = mock.envVarSetDict[name];
    if (existingValue) {
      assert.fail(`Error: env var ${name} is set multiple times!`);
    }

    // Ensure their values are the expected ones.
    if (name === utils.BaseLibUtils.cachingFormatEnvName) {
      assert.equal(value, "Files");
    } else if (name === globals.outVcpkgRootPath) {
      assert.equal(value, vcpkgRoot);
    } else if (name === globals.outVcpkgTriplet) {
      // no check on value here...
    } else if (name === globals.vcpkgRoot) {
      // no check on value here...
    } else {
      assert.fail(`Unexpected variable name: '${name}'`);
    }
  });

import { VcpkgRunner } from '../src/vcpkg-runner';

mock.inputsMocks.reset();
mock.inputsMocks.setInput(globals.vcpkgArguments, 'vcpkg_args');
mock.inputsMocks.setInput(globals.vcpkgTriplet, 'triplet');
// Must not be provided, otherwise a warning would be triggered
//mock.inputsMocks.setInput(globals.vcpkgCommitId, gitRef);
mock.inputsMocks.setInput(globals.vcpkgArtifactIgnoreEntries, '!.git');
mock.inputsMocks.setBooleanInput(globals.setupOnly, false);
mock.inputsMocks.setBooleanInput(globals.doNotUpdateVcpkg, false);
mock.inputsMocks.setBooleanInput(globals.cleanAfterBuild, true);
mock.inputsMocks.setInput(globals.vcpkgDirectory, vcpkgRoot);

testutils.testWithHeader('run-vcpkg must build (by running bootstrap) when the version of the repository is different than the last built binary, and it must install successfully the ports.', async () => {
  const answers: testutils.TaskLibAnswers = {
    "exec": {
      [`${gitPath}`]:
        { code: 0, stdout: "git output" },
      [`${gitPath} rev-parse HEAD`]:
        { code: 0, stdout: "differentgitref" },
      [`${path.join(vcpkgRoot, vcpkgExeName)} install --recurse vcpkg_args --triplet triplet --clean-after-build`]:
        { 'code': 0, 'stdout': 'this is the vcpkg output' },
      [`${path.join(vcpkgRoot, vcpkgExeName)} remove --outdated --recurse`]:
        { 'code': 0, 'stdout': 'this is the vcpkg remove output' },
      [`${gitPath} clone https://github.com/microsoft/vcpkg.git -n .`]:
        { 'code': 0, 'stdout': 'this is git clone ... output' },
      [`${gitPath} submodule status ${vcpkgRoot}`]:
        { 'code': 0, stdout: 'this is git submodule output' },
      [`${gitPath} checkout --force ${gitRef}`]:
        { 'code': 0, 'stdout': `this is git checkout ${gitRef} output` },
      [`chmod +x ${path.join(vcpkgRoot, "vcpkg")}`]:
        { 'code': 0, 'stdout': 'chmod output here' },
      [`chmod +x ${path.join(vcpkgRoot, "bootstrap-vcpkg.sh")}`]:
        { 'code': 0, 'stdout': 'this is the output of chmod +x bootstrap' },
      [gitPath]: { 'code': 0, 'stdout': 'git output here' },
      [`${prefix}${path.join(vcpkgRoot, bootstrapName)}`]:
        { 'code': 0, 'stdout': 'this is the output of bootstrap-vcpkg' }
    },
    "exist": {
      [vcpkgRoot]: true,
      [vcpkgExePath]: true
    },
    "stats": {
      [vcpkgExePath]: true,
      [vcpkgRoot]: true,
    },
    'which': {
      'git': '/usr/local/bin/git',
      'sh': '/bin/bash',
      'chmod': '/bin/chmod',
      'cmd.exe': 'cmd.exe',
      [vcpkgExePath]: vcpkgExePath
    },
  };
  mock.answersMocks.reset(answers);

  const vcpkg: VcpkgRunner = new VcpkgRunner(mock.exportedBaselib);
  // HACK: any to access private fields.
  let vcpkgBuildMock = jest.spyOn(<any>vcpkg, 'build');

  // Act.
  try {
    await vcpkg.run();
  }
  catch (error) {
    throw new Error(`run must have succeeded, instead it failed: ${error} \n ${error.stack}`);
  }

  // Assert.
  expect(mock.exportedBaselib.warning).toBeCalledTimes(0);
  expect(mock.exportedBaselib.error).toBeCalledTimes(0);
  // Build of vcpkg must not happen.
  expect(vcpkgBuildMock).toBeCalledTimes(1);
});