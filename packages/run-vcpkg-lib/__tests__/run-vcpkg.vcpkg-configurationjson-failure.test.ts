// Copyright (c) 2019-2020-2021-2022-2023-2024 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as globals from '../src/vcpkg-globals';
import * as testutils from './utils';
import * as path from 'path';
import * as mock from './mocks';
import * as assert from 'assert';
import * as utils from '@lukka/base-util-lib';
import * as runvcpkgutils from '../src/vcpkg-utils'
import * as fastglob from 'fast-glob';

// Arrange.
const isWin = process.platform === "win32";
const vcpkgBaselineCommitId = '01d4567890123456789012345678901234567890';
const gitPath = '/usr/local/bin/git';
const vcpkgRoot = '/path/to/vcpkg';
const vcpkgExeName = isWin ? "vcpkg.exe" : "vcpkg";
const vcpkgExePath = path.join(vcpkgRoot, vcpkgExeName);
const prefix = isWin ? "cmd.exe /c " : "/bin/bash -c ";
const bootstrapName = isWin ? "bootstrap-vcpkg.bat" : "bootstrap-vcpkg.sh";
const vcpkgConfigurationJsonFile = "/path/to/vcpkg-configuration.json";

mock.VcpkgMocks.isVcpkgSubmodule = false;
mock.VcpkgMocks.vcpkgRoot = vcpkgRoot;
mock.VcpkgMocks.vcpkgExePath = vcpkgExePath;

jest.spyOn(utils.BaseUtilLib.prototype, 'readFile').mockImplementation(
  function (this: utils.BaseUtilLib, file: string): string {
    if (testutils.areEqualVerbose(file, vcpkgConfigurationJsonFile)) {
      return `{"default-registry": {"kind": "builtin","baseline": "${vcpkgBaselineCommitId}"}}`;
    }
    else
      throw `readFile called with unexpected file name: '${file}'.`;
  });

// Return an empty list of hits both for vcpkg.json and vcpkg-configuration.json.
jest.mock('fast-glob',
  () => {
    return {
      glob: (_1: string | string[], _2: fastglob.Options | undefined) => Promise.resolve([]),
    }
  });

const baseUtil = new utils.BaseUtilLib(mock.exportedBaselib);

import { VcpkgRunner } from '../src/vcpkg-runner';

testutils.testWithHeader('run-vcpkg must fail if nor vcpkg-configuration.json nor vcpkg.json are found and no vcpkgGitCommitId is provided and vcpkg is not a submodule.',
  async () => {
    let installRoot: string = await runvcpkgutils.getDefaultVcpkgInstallDirectory(baseUtil.baseLib);
    if (baseUtil.isWin32()) {
      installRoot = 'c:\\github\\workspace\\on\\windows\\';
      process.env[globals.VCPKG_INSTALLED_DIR] = installRoot;
    }

    const answers: testutils.BaseLibAnswers = {
      "exec": {
        [`${gitPath}`]:
          { code: 0, stdout: "git output" },
        [`${gitPath} rev-parse HEAD`]:
          { code: 0, stdout: 'mygitref' },
        [`${gitPath} clone https://github.com/microsoft/vcpkg.git -n .`]:
          { 'code': 0, 'stdout': 'this is git clone ... output' },
        [`${gitPath} submodule status ${vcpkgRoot}`]:
          { 'code': 0, stdout: 'this is git submodule output' },
        [`${gitPath} checkout --force ${vcpkgBaselineCommitId}`]:
          { 'code': 0, 'stdout': `this is git checkout ${vcpkgBaselineCommitId} output` },
        [`chmod +x ${path.join(vcpkgRoot, "vcpkg")}`]:
          { 'code': 0, 'stdout': 'chmod output here' },
        [`chmod +x ${path.join(vcpkgRoot, "bootstrap-vcpkg.sh")}`]:
          { 'code': 0, 'stdout': 'this is the output of chmod +x bootstrap' },
        [`${prefix}${path.join(vcpkgRoot, bootstrapName)}`]:
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

    // Act and Assert.
    try {
      await VcpkgRunner.create(
        baseUtil,
        vcpkgRoot,
        null,
        null, // vcpkgGitCommitId is intentionally absent.
        false, // Dont run `vcpkg install`.
        false, // Must be false
        [],
        "/path/to/location/of/vcpkgjson/",
        [],
        "/path/to/vcpkgconfigurationjson",
        null);
    }
    catch (error) {
      expect(error as Error).toBeTruthy();
      expect((error as Error).message).toContain("A Git commit id for vcpkg's baseline was not found nor in vcpkg.json nor in vcpkg-configuration.json");
    }

    // Asserts.
    // In this code path, no warning nor errors are outputted until the exception sent out is 
    // catched, hence no calls to warning() nor error().
    expect(mock.exportedBaselib.warning).toHaveBeenCalledTimes(0);
    expect(mock.exportedBaselib.error).toHaveBeenCalledTimes(0);
  });
