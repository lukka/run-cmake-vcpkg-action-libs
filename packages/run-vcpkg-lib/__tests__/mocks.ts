// Copyright (c) 2019-2020 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import { BaseLibUtils } from '@lukka/base-lib';
import { ActionLib, ActionToolRunner } from '@lukka/action-lib/src';
import { ExecOptions } from 'child_process';
import * as testutils from './utils'

export const answersMocks: testutils.MockAnswers = new testutils.MockAnswers()
export const inputsMocks: testutils.MockInputs = new testutils.MockInputs();
export const stdout: string[] = [];

jest.mock('@lukka/base-lib', jest.fn().mockImplementation(() => {
  return {
    BaseLibUtils: jest.fn().mockImplementation(() => {
      return {
        writeFile: jest.fn(),
        isWin32: jest.fn().mockImplementation(() => process.platform.toLowerCase() === 'win32'),
        isMacos: jest.fn().mockImplementation(() => process.platform.toLowerCase() === 'darwin'),
        isBSD: jest.fn().mockImplementation(() => process.platform.toLowerCase().indexOf("bsd") != -1),
        isLinux: jest.fn().mockImplementation(() => process.platform.toLowerCase() === 'linux'),
        throwIfErrorCode: jest.fn(),
        directoryExists: jest.fn(),
        isVcpkgSubmodule: jest.fn(),
        setOutputs: jest.fn(),
        setEnvVar: jest.fn(),
        wrapOpSync: jest.fn().mockImplementation(<T>(name: string, fn: () => Promise<T>): Promise<T> => {
          console.log(name);
          return Promise.resolve(fn());
        }),
        wrapOp: jest.fn().mockImplementation(<T>(name: string, fn: () => T): T => {
          console.log(name);
          return fn();
        }),
        trimString: jest.fn().mockImplementation((value: string) => value?.trim() ?? ""
        ),
      }
    }),
    exec: jest.fn(),
    execSync: jest.fn(),
  }
}));

// How to mock resources:
// Howto: https://stackoverflow.com/questions/47402005/jest-mock-how-to-mock-es6-class-default-import-using-factory-parameter
// How to mock methods in detail: https://stackoverflow.com/questions/50091438/jest-how-to-mock-one-specific-method-of-a-class

const MockBaseLibUtils = BaseLibUtils as jest.Mocked<typeof BaseLibUtils>;
MockBaseLibUtils.extractTriplet = jest.fn().mockImplementation(() => null);

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
        execSync: jest.fn().mockImplementation(function (this: ActionLib, cmd: string, args: string[]) {
          return answersMocks.getResponse('exec', cmd + " " + args.join(' '));
        }),
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
          jest.fn().mockImplementation((msg: string) => {
            console.log(`test warn: ${msg}`);
          }),
        error:
          jest.fn().mockImplementation((msg: string) => {
            console.log(`test err: ${msg}`);
          }),
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

jest.mock('strip-json-comments',
  jest.fn().mockImplementation(() => {
    return {
      ActionLib: jest.fn().mockImplementation(() => {
        return {
          stripJsonComments: jest.fn().mockImplementation((str: string) => str)
        }
      })
    }
  }));
