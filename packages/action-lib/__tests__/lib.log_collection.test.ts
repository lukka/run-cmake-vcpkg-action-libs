// Copyright (c) 2019-2020-2021 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as testutils from '../../run-vcpkg-lib/__tests__/utils'
import * as baselib from '@lukka/base-lib';
import { ActionLib } from '../src/action-lib';
import { ToolRunner } from '@actions/exec/lib/toolrunner';
import { LogFileCollector } from '@lukka/base-util-lib';

const expectedMatch1 = '/a/';
const expectedMatch2 = 'C:\\vcpkg\\buildtrees\\abc\\install-x86-windows-dbg-out.log';

testutils.testWithHeader('ToolRunner.exec must call listeners and LogFileCollector must match regular expressions.', async () => {
  let matches: string[] = [];
  let actionLib: ActionLib = new ActionLib();
  const echoCmd = await actionLib.which("echo", true);
  const logFileCollector: LogFileCollector = new LogFileCollector(actionLib, ["See also \"(.+)\"", "See logs for more information:\\s*(.+.log)"],
    (text: string) => {
      console.log(`Matched: '${text}'.`);
      matches.push(text);
    });
  const options = {
    cwd: process.cwd(),
    failOnStdErr: false,
    ignoreReturnCode: false,
    silent: false,
    windowsVerbatimArguments: false,
    outStream: process.stdout,
    errStream: process.stderr,
    listeners: { 
      stdout: (t: Buffer) => logFileCollector.handleOutput(t),
      stderr: (t: Buffer) => logFileCollector.handleOutput(t) 
    },
    env: process.env
  } as baselib.ExecOptions;

  let dummyContentForTheLog = "";
  for (let i in [...Array(LogFileCollector.MAXLEN * 2).keys()]) {
    dummyContentForTheLog += "_";

    // Add a newline with probability 1/50.
    if (Math.round(Math.random() * 50.) === 1)
      dummyContentForTheLog += "\n";
  }
  let toolRunner: ToolRunner = new ToolRunner(echoCmd, [`${dummyContentForTheLog} See also \"${expectedMatch1}\" ${dummyContentForTheLog} See logs for more information:\n${expectedMatch2}`], options);
  const exitcode = await toolRunner.exec();

  // Assert.
  console.log(`Array of matches: '${matches}'.`);
  expect(exitcode).toEqual(0);
  expect(matches).toEqual(["/a/", "C:\\vcpkg\\buildtrees\\abc\\install-x86-windows-dbg-out.log"]);
});
