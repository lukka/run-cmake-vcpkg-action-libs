// Copyright (c) 2019-2020 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as baselib from '@lukka/base-lib'
import * as actionlib from '@lukka/action-lib'
import { ExecOptions } from 'child_process';
import * as globals from '../src/vcpkg-globals'
import * as testutils from './utils'
import { ActionToolRunner, ActionLib } from '@lukka/action-lib/src';
import * as path from 'path'
import * as mock from './mocks'
import * as assert from 'assert'
import * as utils from '@lukka/base-lib';

jest.spyOn(utils.BaseLibUtils.prototype, 'readFile').mockImplementation(
  function (this: utils.BaseLibUtils, file: string): [boolean, string] {
    if (file == `${vcpkgRoot}/.artifactignore`) {
      return [true, "!.git\n"];
    }
    else if (file == `${vcpkgRoot}/${globals.vcpkgLastBuiltCommitId}`) {
      return [true, "gitref"];
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

jest.spyOn(utils.BaseLibUtils.prototype, 'isVcpkgSubmodule').mockImplementation(
  function (this: utils.BaseLibUtils, gitPath: string, fullVcpkgPath: string): Promise<boolean> {
    return Promise.resolve(false);
  });

import { VcpkgRunner } from '../src/vcpkg-runner';

mock.inputsMocks.setInput(globals.vcpkgArguments, 'vcpkg_args');
mock.inputsMocks.setInput(globals.vcpkgTriplet, 'triplet');
mock.inputsMocks.setInput(globals.vcpkgCommitId, 'newgitref');
mock.inputsMocks.setInput(globals.vcpkgArtifactIgnoreEntries, '!.git');
mock.inputsMocks.setBooleanInput(globals.setupOnly, false);
mock.inputsMocks.setBooleanInput(globals.doNotUpdateVcpkg, false);
mock.inputsMocks.setBooleanInput(globals.cleanAfterBuild, true);

const gitPath = '/usr/local/bin/git';
const vcpkgRoot = '/path/to/vcpkg';
const getVcpkgExeName = function (): string { return (process.platform === "win32" ? "vcpkg.exe" : "vcpkg") };
const vcpkgExeName = getVcpkgExeName();
const vcpkgExePath = path.join(vcpkgRoot, vcpkgExeName);

// Mock the execSync of ActionToolRunner.
jest.spyOn(ActionToolRunner.prototype, 'execSync').mockImplementation(
  function (this: ActionToolRunner, options?: ExecOptions): Promise<baselib.ExecResult> {
    const toolRunnerPrivateAccess: any = this;
    const response = mock.answersMocks.getResponse('exec', `${toolRunnerPrivateAccess.path} ${toolRunnerPrivateAccess.arguments.join(' ')}`);
    console.log(response);
    console.log(JSON.stringify(response));
    return Promise.resolve({ code: response.code, stdout: response.stdout, stderr: response.stderr } as baselib.ExecResult);
  });

jest.spyOn(ActionToolRunner.prototype, 'exec').mockImplementation(
  function (this: ActionToolRunner, options?: ExecOptions): Promise<number> {
    const toolRunnerPrivateAccess: any = this;
    const response = mock.answersMocks.getResponse('exec', `${toolRunnerPrivateAccess.path} ${toolRunnerPrivateAccess.arguments.join(' ')}`);
    console.log(response);
    return Promise.resolve(response.code);
  });

test('run-vcpkg should succeed', async () => {
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
      [`${gitPath} checkout --force newgitref`]:
        { 'code': 0, 'stdout': 'this is git checkout newgitref output' },
      [`chmod +x ${path.join(vcpkgRoot, "vcpkg")}`]:
        { 'code': 0, 'stdout': 'chmod output here' },
      [`chmod +x ${path.join(vcpkgRoot, "bootstrap-vcpkg.sh")}`]:
        { 'code': 0, 'stdout': 'this is the output of chmod +x bootstrap' },
      [gitPath]: { 'code': 0, 'stdout': 'git output here' },
      [`/bin/bash -c ${vcpkgRoot}/bootstrap-vcpkg.sh`]:
        { 'code': 0, 'stdout': 'this is the output of bootstrap-vcpkg' },

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

  const baselib: baselib.BaseLib = new actionlib.ActionLib();

  baselib.getInput = jest.fn().mockImplementation((name: string, options: any) => {
    switch (name) {
      case globals.vcpkgArguments: return 'vcpkg_args';
      case globals.vcpkgTriplet: return 'triplet';
      case globals.vcpkgCommitId: return 'newgitref';
      case globals.vcpkgGitURL: return 'https://github.com/microsoft/vcpkg.git';
    }
  });
  baselib.getPathInput = jest.fn().mockImplementation((name: string, options: any) => {
    switch (name) {
      case globals.vcpkgDirectory: return vcpkgRoot;
    }
  });

  baselib.exec = jest.fn().mockImplementation((cmd: string, args: string[]) => {
    mock.answersMocks.printResponse('exec', cmd);
  });

  baselib.rmRF = jest.fn();
  const vcpkg: VcpkgRunner = new VcpkgRunner(baselib);
  try {
    await vcpkg.run();
  }
  catch (error) {
    throw new Error(`run must have succeeded, instead if failed: ${error} \n ${error.stack}`);
  }

  expect(baselib.warning).toBeCalledTimes(0);
  expect(baselib.error).toBeCalledTimes(0);

  console.log(mock.baselibInfo.mock.calls.length);
  console.log(mock.baselibInfo.mock.calls);
  const calls = mock.baselibInfo.mock.calls.filter((item) => {
    return RegExp('.*vcpkg install --recurse vcpkg_args --triplet triplet.*').test(item[0])
  });
  expect(calls.length).toBe(1);
});
