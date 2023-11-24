// Copyright (c) 2019-2020-2021-2022-2023 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as globals from '../src/vcpkg-globals';
import * as testutils from './utils';
import * as path from 'path';
import * as mock from './mocks';
import * as assert from 'assert';
import * as utils from '@lukka/base-util-lib';
import * as runvcpkgrunner from '../src/vcpkg-runner'
import * as runvcpkgutils from '../src/vcpkg-utils'

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

jest.spyOn(runvcpkgrunner.VcpkgRunner, "getVcpkgConfigurationJsonPath").mockImplementationOnce(
  function (baseUtilLib, path): Promise<string | null> {
    return Promise.resolve(null);
  });


jest.spyOn(utils.BaseUtilLib.prototype, 'setEnvVar').mockImplementation(
  function (this: utils.BaseUtilLib, name: string, value: string): void {
    // Ensure they are not set twice.
    const existingValue: string = mock.envVarSetDict[name];
    if (existingValue) {
      assert.fail(`Error: env var ${name} is set multiple times!`);
    }

    // Ensure their values are the expected ones.
    switch (name) {
      case globals.VCPKGROOT:
      case globals.RUNVCPKG_VCPKG_ROOT:
        assert.strictEqual(value, vcpkgRoot);
        break;
      case globals.VCPKGDEFAULTTRIPLET:
      case globals.RUNVCPKG_VCPKG_DEFAULT_TRIPLET:
      case globals.VCPKG_BINARY_SOURCES:
        break;
      default:
        assert.fail(`Unexpected variable name: '${name}'`);
    }
  });

const baseUtil = new utils.BaseUtilLib(mock.exportedBaselib);

import { VcpkgRunner } from '../src/vcpkg-runner';

testutils.testWithHeader('run-vcpkg must fail if vcpkg-configuration.json is not found and no vcpkgGitCommitId is provided and vcpkg is not a submodule.', async () => {
  let installRoot: string = await runvcpkgutils.getDefaultVcpkgInstallDirectory(baseUtil.baseLib);
  if (baseUtil.isWin32()) {
    installRoot = 'c:\\github\\workspace\\on\\windows\\';
    process.env["VCPKG_INSTALLED_DIR"] = installRoot;
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
      [gitPath]: { 'code': 0, 'stdout': 'git output here' },
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
      null, // vcpkgGitCommitId
      true, // Must be true
      false, // Must be false
      [],
      "/path/to/location/of/vcpkgjson/",
      null,
      "/path/to/vcpkgconfigurationjson");
  }
  catch (error) {
    expect(error as Error).toBeTruthy();
    expect((error as Error).toString()).toContain("'vcpkgCommitId's input was not provided, and no vcpkg-configuration.json containing a baseline was found.")
  }

  // Assert.
  // One warn() call to warn user about vcpkg-configuration.json file not found.
  expect(mock.exportedBaselib.warning).toHaveBeenCalledTimes(1);
  expect(mock.exportedBaselib.error).toHaveBeenCalledTimes(0);
});
