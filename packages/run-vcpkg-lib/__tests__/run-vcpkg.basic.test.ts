// Copyright (c) 2019-2020 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as baselib from '@lukka/base-lib'
import * as actionlib from '@lukka/action-lib'
import { ExecOptions } from 'child_process';
import { VcpkgRunner } from '../src/vcpkg-runner';
import * as globals from '../src/vcpkg-globals'
import * as testutils from './utils'
import { ActionToolRunner, ActionLib } from '@lukka/action-lib/src';
import * as path from 'path'
import * as mock from './mocks'
import { BaseLibUtils } from '@lukka/base-lib/src/utils';

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

jest.spyOn(BaseLibUtils.prototype, 'isVcpkgSubmodule').mockImplementation(
  function (gitPath: string, fullVcpkgPath: string): Promise<boolean> {
    return Promise.resolve(true);
  });

test('testing...', async () => {
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
      [`${gitPath} submodule`]:
        { 'code': 0, 'stdout': 'this is git submodule output' },
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
      'git': '/usr/local/bin/git', 'sh': '/bin/bash', 'chmod': '/bin/chmod',
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
    fail(`run must have succeeded, instead if failed: ${error}`);
  }

  expect(baselib.warning).toBeCalledTimes(0);
  expect(baselib.error).toBeCalledTimes(0);
  
  //??assert.ok(tr.stdout.indexOf(" --triplet triplet") != -1, "Stdout must contain the triplet argument passed to vcpkg");

});

