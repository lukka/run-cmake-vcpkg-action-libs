// Copyright (c) 2019-2020-2021 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as lib from '../src/action-lib'
import * as baselib from '@lukka/base-lib'
import * as core from '@actions/core'
import * as baseutillib from '@lukka/base-util-lib'
import * as fs from 'fs';
import * as path from 'path'
import * as os from 'os'

function getExistingTempDir(): string {
  if (!process.env.GITHUB_WORKSPACE) {
    process.env.GITHUB_WORKSPACE = path.join(os.tmpdir(), process.pid.toString());
  }

  const testDir = path.join(process.env.GITHUB_WORKSPACE, "testDir");
  fs.mkdirSync(testDir, { recursive: true });
  return testDir;
}

test('ActionToolRunner exec() and execSync() tests', async () => {
  const options: baselib.ExecOptions = {
    cwd: process.cwd(),
    failOnStdErr: false,
    errStream: process.stdout,
    outStream: process.stdout,
    ignoreReturnCode: true,
    silent: false,
    windowsVerbatimArguments: false,
    env: process.env
  } as baselib.ExecOptions;

  const actionlib = new lib.ActionLib();
  const gitPath = await actionlib.which("git", true);
  {
    let toolRunner: lib.ActionToolRunner = new lib.ActionToolRunner(gitPath);
    toolRunner.arg("--version");
    const result = await toolRunner.execSync(options)
    expect(result.code).toBe(0);
    const exitcode = await toolRunner.exec(options);
    expect(exitcode).toBe(0);
  }

  {
    let toolRunner: lib.ActionToolRunner = new lib.ActionToolRunner(gitPath);
    toolRunner.line("--version");
    const result = await toolRunner.execSync(options)
    expect(result.code).toBe(0);

    const exitcode = await toolRunner.exec(options);
    expect(exitcode).toBe(0);
  }
});

test('ActionLib exec() execSync() tests', async () => {
  const options: baselib.ExecOptions = {
    cwd: process.cwd(),
    failOnStdErr: false,
    errStream: process.stdout,
    outStream: process.stdout,
    ignoreReturnCode: true,
    silent: false,
    windowsVerbatimArguments: false,
    env: process.env
  } as baselib.ExecOptions;

  const actionLib: lib.ActionLib = new lib.ActionLib();
  const gitPath = await actionLib.which("git", true);
  const exitcode = await actionLib.exec(gitPath, ["--version"], options);
  expect(exitcode).toBe(0);
  const exitcodeNoArgs = await actionLib.exec(gitPath, [], options);
  expect(exitcodeNoArgs).toBe(1);// Tools return 1 when display help message.

  const result = await actionLib.execSync(gitPath, ["--version"], options);
  expect(actionLib.exist(options.cwd)).toBeTruthy();
  const st: fs.Stats = actionLib.stats(gitPath);
  expect(st.isFile).toBeTruthy();
  expect(result.code).toBe(0);
});

test('ActionLib info(), warn(), error() tests', async () => {
  const actionLib: lib.ActionLib = new lib.ActionLib();
  const infoMock = jest.spyOn(core, "info").mockImplementation(() => { });
  const warningMock = jest.spyOn(core, "warning").mockImplementation(() => { });
  const errorMock = jest.spyOn(core, "error").mockImplementation(() => { });
  actionLib.info("info message");
  expect(infoMock).toBeCalledTimes(1);
  actionLib.warning("warning message");
  expect(warningMock).toBeCalledTimes(1);
  actionLib.error("error message");
  expect(errorMock).toBeCalledTimes(1);
});

test('ActionLib which()/exists() tests', async () => {
  const actionLib: lib.ActionLib = new lib.ActionLib();
  await expect(actionLib.which("reallynotexistenttool", true)).rejects.toThrow();
  const toolPath = await actionLib.which("reallynotexistenttool", false);
  expect(toolPath).toBeFalsy();
  const gitPath = await actionLib.which("git", true);
  const doGitExist: boolean = await actionLib.exist(gitPath);
  expect(doGitExist).toBeTruthy();
});

test('ActionLib&Utils mkdirP() tests', async () => {
  const actionLib: lib.ActionLib = new lib.ActionLib();
  const util: baseutillib.BaseUtilLib = new baseutillib.BaseUtilLib(actionLib);

  const createdDir = getExistingTempDir();
  await actionLib.mkdirP(createdDir);
  const exist = await actionLib.exist(createdDir);
  expect(exist).toBeTruthy();
  await actionLib.mkdirP(createdDir);// Creating the second time should not throw.
});

test('ActionLib&Utils exist()/readFile()/writeFile()/get*Dir() tests', async () => {
  const actionLib: lib.ActionLib = new lib.ActionLib();
  const util: baseutillib.BaseUtilLib = new baseutillib.BaseUtilLib(actionLib);

  expect(async () => await actionLib.getArtifactsDir()).toBeTruthy();
  expect(async () => await actionLib.getBinDir()).toBeTruthy();
  expect(async () => await actionLib.getSrcDir()).toBeTruthy();

  const createdDir = getExistingTempDir();

  const createdFile = path.join(createdDir, "file");
  const fileContent = "fileContent";
  actionLib.writeFile(createdFile, fileContent);
  const content = util.readFile(createdFile);
  expect(content).toBeTruthy();
  expect(content).toBe(fileContent);

  util.writeFile(createdFile, fileContent);
  const content2 = util.readFile(createdFile);
  expect(content2).toBe(fileContent);

  await actionLib.rmRF(createdDir);
  const dontExist = await actionLib.exist(createdDir);
  expect(dontExist).toBeFalsy();

  // Just call, expect not exceptions.
  actionLib.beginOperation("operation");
  actionLib.endOperation();

  actionLib.setState("name", "value");
  actionLib.getState("name");
});

test('getInput()/getPathInput(): when input is not defined, it must return undefined', async () => {
  // core.getInput return an empty string when the input is not defined.
  jest.spyOn(core, "getInput").mockImplementation(() => { return ""; });

  const actionLib: lib.ActionLib = new lib.ActionLib();
  expect(actionLib.getInput("not-existent", false)).toBeUndefined();
  expect(actionLib.getPathInput("not-existent", false, false)).toBeUndefined();
});

test('getInput()/getPathInput(): when input is not defined and it is required, it must throw.', async () => {
  // core.getInput return an empty string when the input is not defined.
  jest.spyOn(core, "getInput").mockImplementation(() => { return ""; });

  const actionLib: lib.ActionLib = new lib.ActionLib();
  expect(() => actionLib.getInput("existent", true)).toThrowError();
  expect(() => actionLib.getPathInput("existent", true, false)).toThrowError();
});

test('getPathInput(): when input is defined, but not existent, it must throw.', async () => {
  // core.getInput return an empty string when the input is not defined.
  jest.spyOn(core, "getInput").mockImplementation(() => { return "/not/existent/"; });

  const actionLib: lib.ActionLib = new lib.ActionLib();
  expect(() => actionLib.getPathInput("existent", true, true)).toThrowError();
  expect(() => actionLib.getPathInput("existent", false, true)).toThrowError();
});
