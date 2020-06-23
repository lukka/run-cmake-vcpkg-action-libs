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
import { BaseLibUtils } from '@lukka/base-lib';
import { ActionLib, ActionToolRunner } from '@lukka/action-lib/src';

const answersMocks: testutils.MockAnswers = new testutils.MockAnswers()
const inputsMocks: testutils.MockInputs = new testutils.MockInputs();

inputsMocks.setInput(globals.vcpkgArguments, 'vcpkg_args');
inputsMocks.setInput(globals.vcpkgTriplet, 'triplet');
inputsMocks.setInput(globals.vcpkgCommitId, 'newgitref');

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
          jest.fn().mockImplementation((msg: string) => console.log(`debug: ${msg}`)),
        warning:
          jest.fn().mockImplementation((msg: string) => console.log(`warn: ${msg}`)),
        error:
          jest.fn().mockImplementation((msg: string) => console.log(`err: ${msg}`)),
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
          jest.fn().mockImplementation((toolPath: string) => {
            return new ActionToolRunner(toolPath);
          })
      };
    }),
    ActionToolRunner: jest.fn().mockImplementation(() => {
      return {
        arg:
          jest.fn(),
        exec:
          jest.fn(),
        execSync:
          jest.fn()
      }
    })
  }
}));

function init(ans: testutils.MockAnswers): void {
}


test('testing...', async () => {
  const answers: testutils.TaskLibAnswers = {
    "exec": { "git": { code: 0, stdout: "git output" } }
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
      case globals.vcpkgDirectory: return '/var/tmp/vcpkg_test';
    }
  });

  baselib.exec = jest.fn().mockImplementation((cmd: string, args: string[]) => {
    answersMocks.printResponse('exec', cmd);
  });

  baselib.rmRF = jest.fn();
  const vcpkg: VcpkgRunner = new VcpkgRunner(baselib);
  await vcpkg.run();
});

