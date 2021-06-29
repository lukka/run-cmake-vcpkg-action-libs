// Copyright (c) 2019-2020-2021 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as testutils from '../../run-vcpkg-lib/__tests__/utils'
import * as baselib from '@lukka/base-lib';
import { ActionLib, ActionToolRunner } from '../src/action-lib';
import { LogFileCollector } from '@lukka/base-util-lib';

const expectedMatch1 = "/home/runner/work/CppBuildTasks-Validation/b/dump_log/CMakeFiles/CMakeOutput.log";
const expectedMatch2 = '/home/runner/work/CppBuildTasks-Validation/b/dump_log/CMakeFiles/CMakeError.log';
const expectedMatch3 = '/home/runner/work/project/3rdparty/vcpkg/buildtrees/hunspell/build-dist-x64-linux-dbg-out.log';
const expectedMatch4 = '/home/runner/work/project/3rdparty/vcpkg/buildtrees/hunspell/build-dist-x64-linux-dbg-err.log';

testutils.testWithHeader('ToolRunner.exec must call listeners and LogFileCollector must match regular expressions.', async () => {
  let matches: string[] = [];
  let actionLib: ActionLib = new ActionLib();
  const echoCmd = await actionLib.which("echo", true);
  const logFileCollector: LogFileCollector = new LogFileCollector(actionLib, [
    "\\s*\"(.+CMakeOutput\\.log)\"\\.\\s*",
    "\\s*\"(.+CMakeError\\.log)\"\\.\\s*",
    "\\s+(.+err\\.log)\\s*",
    "\\s+(.+out\\.log)\\s*"],
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
  let toolRunner: baselib.ToolRunner = new ActionToolRunner(echoCmd);
  toolRunner.arg([`${dummyContentForTheLog}   -- Configuring incomplete, errors occurred!
  See also "${expectedMatch1}".
  See also "${expectedMatch2}".
 ${dummyContentForTheLog} 
  CMake Error at scripts/cmake/vcpkg_execute_build_process.cmake:146 (message):
  Command failed: /usr/bin/make V=1 -j 3 -f Makefile dist
  Working Directory: /home/runner/work/project/3rdparty/vcpkg/buildtrees/hunspell/x64-linux-dbg
  See logs for more information:
    ${expectedMatch3}

  CMake Error at scripts/cmake/vcpkg_execute_required_process.cmake:91 (file):
    file failed to open for reading (No such file or directory):
    ${expectedMatch4}
  Call Stack (most recent call first):
    scripts/cmake/vcpkg_from_git.cmake:85 (vcpkg_execute_required_process)
    ports/bzip2/portfile.cmake:1 (vcpkg_from_git)
    scripts/ports.cmake:142 (include)
`]);
  const exitcode = await toolRunner.exec(options);

  // Assert.
  console.log(`Array of matches: '${matches}'.`);
  expect(exitcode).toEqual(0);
  expect(matches.sort()).toEqual([expectedMatch1, expectedMatch2,
    expectedMatch3, expectedMatch4].sort());
});
