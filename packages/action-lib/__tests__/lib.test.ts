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

test('ActionLib&Utils mkdirP()/exist()/readFile()/writeFile()/get*Dir() tests', async () => {
  const actionLib: lib.ActionLib = new lib.ActionLib();
  const util: baseutillib.BaseUtilLib = new baseutillib.BaseUtilLib(actionLib);

  if (!process.env.GITHUB_WORKSPACE) {
    process.env.GITHUB_WORKSPACE = path.join(os.tmpdir(), process.pid.toString());
    fs.mkdirSync(process.env.GITHUB_WORKSPACE);
  }

  expect(actionLib.getArtifactsDir()).toBeTruthy();
  expect(actionLib.getBinDir()).toBeTruthy();
  expect(actionLib.getSrcDir()).toBeTruthy();

  const createdDir = path.join(actionLib.getArtifactsDir(), "testDir")
  await actionLib.mkdirP(createdDir);
  const exist = await actionLib.exist(createdDir);
  expect(exist).toBeTruthy();

  const createdFile = path.join(createdDir, "file");
  const fileContent = "fileContent";
  actionLib.writeFile(createdFile, fileContent);
  const [ok, content] = util.readFile(createdFile);
  expect(ok).toBeTruthy();
  expect(content).toBe(fileContent);

  util.writeFile(createdFile, fileContent);
  const [ok2, content2] = util.readFile(createdFile);
  expect(ok2).toBeTruthy();
  expect(content2).toBe(fileContent);

  await actionLib.rmRF(createdDir);
  const dontExist = await actionLib.exist(createdDir);
  expect(dontExist).toBeFalsy();

  expect(actionLib.resolve(process.env.GITHUB_WORKSPACE)).toBe(process.env.GITHUB_WORKSPACE);

  actionLib.beginOperation("operation");
  actionLib.endOperation();

  util.wrapOp("wrapOp", () => { return Promise.resolve() });
  util.wrapOpSync("wrapOpSync", () => { return Promise.resolve() });
});
