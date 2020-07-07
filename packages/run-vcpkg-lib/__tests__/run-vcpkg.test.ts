// Copyright (c) 2019-present Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as assert from 'assert';
import * as baselib from '@lukka/base-lib'
import * as actionlib from '@lukka/action-lib'
import { mocked, createJestPreset } from 'ts-jest/utils';
import { ExecOptions } from 'child_process';
import { VcpkgRunner } from '../src/vcpkg-runner';
import * as globals from '../src/vcpkg-globals'
import * as testutils from './utils'
import { BaseLibUtils, ExecResult } from '@lukka/base-lib';
import { ActionLib, ActionToolRunner } from '@lukka/action-lib/src';
import * as path from 'path'

const answersMocks: testutils.MockAnswers = new testutils.MockAnswers()
const inputsMocks: testutils.MockInputs = new testutils.MockInputs();

inputsMocks.setInput(globals.vcpkgArguments, 'vcpkg_args');
inputsMocks.setInput(globals.vcpkgTriplet, 'triplet');
inputsMocks.setInput(globals.vcpkgCommitId, 'newgitref');

// How to mock resources:
// Howto: https://stackoverflow.com/questions/47402005/jest-mock-how-to-mock-es6-class-default-import-using-factory-parameter
// How to mock methods in detail: https://stackoverflow.com/questions/50091438/jest-how-to-mock-one-specific-method-of-a-class

//?? jest.genMockFromModule('@lukka/action-lib');
//??jest.genMockFromModule('@lukka/base-lib');
jest.mock('@lukka/base-lib', jest.fn().mockImplementation(() => {
  return {
    BaseLibUtils: jest.fn().mockImplementation(() => {
      return {
        wrapOpSync: jest.fn(),
        wrapOp: jest.fn(),
        trimString: jest.fn()
      }
    }),
    exec: jest.fn(),
    execSync: jest.fn(),
  }
}));

function toolRunner(toolPath: string) {
  return {
    toolPath: toolPath,
    arg:
      jest.fn(),
    exec:
      jest.fn(),
    execSync: jest.fn().mockImplementation(function (this: ActionToolRunner, options: ExecOptions) {
      const a: any = this.arg;
      return answersMocks.getResponse('exec', a.path);
    })
  }
}

jest.mock('@lukka/action-lib', jest.fn().mockImplementation(() => {
  return {
    ActionLib: jest.fn().mockImplementation(() => {
      return {
        getInput:
          jest.fn().mockImplementation((name: string, required: boolean) =>
            inputsMocks.getInput(name, required)),
        getBoolInput:
          jest.fn().mockImplementation((name: string, required: boolean) =>
            inputsMocks.getBooleanInput(name, required)),
        getDelimitedInput:
          jest.fn().mockImplementation((name: string, separator?: string, required?: boolean) =>
            inputsMocks.getDelimitedInput(name, separator, required)),
        debug:
          jest.fn().mockImplementation((msg: string) => console.log(`test debug: ${msg}`)),
        warning:
          jest.fn().mockImplementation((msg: string) => console.log(`test warn: ${msg}`)),
        error:
          jest.fn().mockImplementation((msg: string) => console.log(`test err: ${msg}`)),
        beginOperation:
          jest.fn(),
        endOperation:
          jest.fn(),
        setVariable:
          jest.fn(),
        setOutput:
          jest.fn(),
        exist:
          jest.fn().mockImplementation((filePath: string) => {
            return answersMocks.getResponse("exist", filePath);
          }),
        which:
          jest.fn().mockImplementation((filePath: string) => {
            return answersMocks.getResponse("which", filePath);
          }),
        mkdirP:
          jest.fn().mockImplementation((dirPath: string) => {
            console.log(`mkdirP(${dirPath})`)
          }),
        cd:
          jest.fn().mockImplementation((dirPath: string) => {
            console.log(`cd(${dirPath})`)
          }),
        tool:
          jest.fn().mockImplementation((toolPath: string) =>
            //??toolRunner(toolPath))
            new ActionToolRunner(toolPath))
      };
    }),
    ActionToolRunner: jest.fn().mockImplementation((toolPath) => toolRunner(toolPath))
  }
}));

const gitPath = '/usr/local/bin/git';
const vcpkgRoot = '/path/to/vcpkg';
const getVcpkgExeName = function (): string { return (process.platform === "win32" ? "vcpkg.exe" : "vcpkg") };
const vcpkgExeName = getVcpkgExeName();
const vcpkgExePath = path.join(vcpkgRoot, vcpkgExeName);

// Mock the execSync of ActionToolRunner.
jest.spyOn(ActionToolRunner.prototype, 'execSync').mockImplementation(function (this: ActionToolRunner, options?: ExecOptions): Promise<ExecResult> {
  const a: any = this;
  const aa = answersMocks.getResponse('exec', a.path);
  return Promise.resolve({ code: aa.code, stdout: aa.stdout, stderr: aa.stderr } as ExecResult);
});

test('testing...', async () => {
  const answers: testutils.TaskLibAnswers = {
    "exec": { "git": { code: 0, stdout: "git output" } },
    "exist": { [vcpkgRoot]: true },
    'which': {
      'git': '/usr/local/bin/git', 'sh': '/bin/bash', 'chmod': '/bin/chmod',
      [vcpkgExePath]: vcpkgExePath
    },
  };
  answersMocks.reset(answers);

  const baselib: baselib.BaseLib = new actionlib.ActionLib();
  baselib.getInput = jest.fn().mockImplementation((name: string, options: any) => {
    switch (name) {
      case globals.vcpkgArguments: return 'vcpkg_args';
      case globals.vcpkgTriplet: return 'triplet';
      case globals.vcpkgCommitId: return 'newgitref';
      case globals.vcpkgGitURL: return 'https://github.com/lukka/vcpkg.git';
    }
  });
  baselib.getPathInput = jest.fn().mockImplementation((name: string, options: any) => {
    switch (name) {
      case globals.vcpkgDirectory: return vcpkgRoot;
    }
  });

  baselib.exec = jest.fn().mockImplementation((cmd: string, args: string[]) => {
    answersMocks.printResponse('exec', cmd);
  });

  baselib.rmRF = jest.fn();
  const vcpkg: VcpkgRunner = new VcpkgRunner(baselib);
  await vcpkg.run();
});

