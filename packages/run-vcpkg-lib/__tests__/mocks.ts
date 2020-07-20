// Copyright (c) 2019-2020 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

// How to mock resources:
// Howto: https://stackoverflow.com/questions/47402005/jest-mock-how-to-mock-es6-class-default-import-using-factory-parameter
// How to mock methods in detail: https://stackoverflow.com/questions/50091438/jest-how-to-mock-one-specific-method-of-a-class

import * as baselib from '@lukka/base-lib';
import { ActionLib, ActionToolRunner } from '@lukka/action-lib/src';
import { ExecOptions } from 'child_process';
import * as testutils from './utils'

export const answersMocks: testutils.MockAnswers = new testutils.MockAnswers()
export const inputsMocks: testutils.MockInputs = new testutils.MockInputs();

const MockBaseLibUtils = baselib.BaseLibUtils as jest.Mocked<typeof baselib.BaseLibUtils>;
MockBaseLibUtils.extractTriplet = jest.fn().mockImplementation(() => null);
MockBaseLibUtils.prototype.readFile = jest.fn().mockImplementation(() => null);

export const envVarSetDict: { [name: string]: string } = {};

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

let lastOperationName: string = "";

export let baselibInfo = jest.fn();

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
        getPathInput:
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
            console.log(`warn: ${msg}`);
          }),
        error:
          jest.fn().mockImplementation((msg: string) => {
            console.log(`err: ${msg}`);
          }),
        info:
          baselibInfo.mockImplementation((msg: string) => {
            console.log(`info: ${msg}`);
          }),
        beginOperation:
          jest.fn().mockImplementation((operationName: string) => {
            testutils.testLog(`beginOperation('${operationName}')`);
            lastOperationName = operationName;
          }),
        endOperation:
          jest.fn().mockImplementation(() => {
            testutils.testLog(`endOperation('${lastOperationName}')`);
          }),
        setVariable:
          jest.fn(),
        setOutput:
          jest.fn(),
        exist:
          jest.fn().mockImplementation((filePath: string) => {
            return answersMocks.getResponse("exist", filePath);
          }),
        stats:
          jest.fn().mockImplementation((filePath: string) => {
            return answersMocks.getResponse("stats", filePath);
          }),
        which:
          jest.fn().mockImplementation((filePath: string) => {
            return answersMocks.getResponse("which", filePath);
          }),
        mkdirP:
          jest.fn().mockImplementation((dirPath: string) => {
            testutils.testLog(`mkdirP(${dirPath})`)
          }),
        cd:
          jest.fn().mockImplementation((dirPath: string) => {
            testutils.testLog(`cd(${dirPath})`)
          }),
        tool:
          jest.fn().mockImplementation((toolPath: string) =>
            new ActionToolRunner(toolPath)),
        writeFile:
          jest.fn().mockImplementation((file: string, content: string) =>
            testutils.testLog(`writeFile('${file}','${content}')`))
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
