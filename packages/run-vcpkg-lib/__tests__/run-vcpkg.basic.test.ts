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
const newGitRef = 'newgitref'
const oldGitRef = 'gitref';
const gitPath = '/usr/local/bin/git';
const vcpkgRoot = '/path/to/vcpkg';
const getVcpkgExeName = function (): string { return (process.platform === "win32" ? "vcpkg.exe" : "vcpkg") };
const vcpkgExeName = getVcpkgExeName();
const vcpkgExePath = path.join(vcpkgRoot, vcpkgExeName);

mock.VcpkgMocks.isVcpkgSubmodule = false;
mock.VcpkgMocks.vcpkgRoot = vcpkgRoot;
mock.VcpkgMocks.vcpkgExePath = vcpkgExePath;

jest.spyOn(utils.BaseLibUtils.prototype, 'readFile').mockImplementation(
  function (this: utils.BaseLibUtils, file: string): [boolean, string] {
    if (testutils.areEqualVerbose(file, path.join(vcpkgRoot, '.artifactignore'))) {
      return [true, "!.git\n"];
    }
    else if (testutils.areEqualVerbose(file, path.join(vcpkgRoot, globals.vcpkgLastBuiltCommitId))) {
      return [true, oldGitRef];
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

mock.inputsMocks.setInput(globals.vcpkgArguments, 'vcpkg_args');
mock.inputsMocks.setInput(globals.vcpkgTriplet, 'triplet');
mock.inputsMocks.setInput(globals.vcpkgCommitId, newGitRef);
mock.inputsMocks.setInput(globals.vcpkgArtifactIgnoreEntries, '!.git');
mock.inputsMocks.setInput(globals.vcpkgDirectory, vcpkgRoot);
mock.inputsMocks.setBooleanInput(globals.setupOnly, false);
mock.inputsMocks.setBooleanInput(globals.doNotUpdateVcpkg, false);
mock.inputsMocks.setBooleanInput(globals.cleanAfterBuild, true);

testutils.testWithHeader('run-vcpkg must build and install successfully', async () => {
  const answers: testutils.TaskLibAnswers = {
    "exec": {
      [`${gitPath}`]:
        { code: 0, stdout: "git output" },
      [`${gitPath} rev-parse HEAD`]:
        { code: 0, stdout: 'mygitref' },
      [`${path.join(vcpkgRoot, "vcpkg")} install --recurse vcpkg_args --triplet triplet --clean-after-build`]:
        { 'code': 0, 'stdout': 'this is the vcpkg output' },
      [`${vcpkgRoot}/vcpkg remove --outdated --recurse`]:
        { 'code': 0, 'stdout': 'this is the vcpkg remove output' },
      [`${gitPath} clone https://github.com/microsoft/vcpkg.git -n .`]:
        { 'code': 0, 'stdout': 'this is git clone ... output' },
      [`${gitPath} submodule status ${vcpkgRoot}`]:
        { 'code': 0, stdout: 'this is git submodule output' },
      [`${gitPath} checkout --force ${newGitRef}`]:
        { 'code': 0, 'stdout': `this is git checkout ${newGitRef} output` },
      [`chmod +x ${path.join(vcpkgRoot, "vcpkg")}`]:
        { 'code': 0, 'stdout': 'chmod output here' },
      [`chmod +x ${path.join(vcpkgRoot, "bootstrap-vcpkg.sh")}`]:
        { 'code': 0, 'stdout': 'this is the output of chmod +x bootstrap' },
      [gitPath]: { 'code': 0, 'stdout': 'git output here' },
      [`/bin/bash -c ${vcpkgRoot}/bootstrap-vcpkg.sh`]:
        { 'code': 0, 'stdout': 'this is the output of bootstrap-vcpkg' },
      ['cmd.exe /c \\path\\to\\vcpkg\\bootstrap-vcpkg.bat']:
        { 'code': 0, 'stdout': 'this is the output of bootstrap-vcpkg.bat' },
      ['\\path\\to\\vcpkg\\vcpkg.exe remove --outdated --recurse']:
        { 'code': 0, 'stdout': 'this is the output of vcpkg remote' },
      ['\\path\\to\\vcpkg\\vcpkg.exe install --recurse vcpkg_args --triplet triplet --clean-after-build']:
        { 'code': 0, 'stdout': 'this is the output of vcpkg install' }

    },
    "exist": { [vcpkgRoot]: true },
    'which': {
      'git': '/usr/local/bin/git',
      'sh': '/bin/bash',
      'chmod': '/bin/chmod',
      'cmd.exe': 'cmd.exe',
      [vcpkgExePath]: vcpkgExePath
    },
  };
  mock.answersMocks.reset(answers);

  // Act.
  const vcpkg: VcpkgRunner = new VcpkgRunner(mock.exportedBaselib);
  try {
    await vcpkg.run();
  }
  catch (error) {
    throw new Error(`run must have succeeded, instead if failed: ${error} \n ${error.stack}`);
  }

  // Assert.
  expect(mock.exportedBaselib.warning).toBeCalledTimes(0);
  expect(mock.exportedBaselib.error).toBeCalledTimes(0);

  // There must be a call to execute the command 'vcpkg install' with correct arguments
  // and triplet passed to it.
  const calls = mock.baselibInfo.mock.calls.filter((item) => {
    return RegExp('.*vcpkg install --recurse vcpkg_args --triplet triplet.*').test(item[0])
  });
  expect(calls.length).toBe(1);
});
