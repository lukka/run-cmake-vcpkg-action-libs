// Copyright (c) 2019-2020-2021 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as cmakeutils from '../src/cmake-utils'
import * as cmakerunner from '../src/cmake-runner'
import * as baseutillib from '@lukka/base-util-lib'
import path from 'path'
import * as mock from '../../run-vcpkg-lib/__tests__/mocks'
import * as testutils from '../../run-vcpkg-lib/__tests__/utils'
import { BaseLib } from '@lukka/base-lib';

const baseLib: BaseLib = mock.exportedBaselib;
const baseUtilLib: baseutillib.BaseUtilLib = new baseutillib.BaseUtilLib(baseLib);

const vcpkgRoot = "/vcpkgroot/";
const isWin = process.platform === "win32";
const vcpkgExe = isWin ? 'vcpkg.exe' : 'vcpkg';
const triplet = baseUtilLib.getDefaultTriplet();
const vcpkgEnvOutput = "vcpkg env's output:\nA=1\nB=2\n";
jest.spyOn(baseutillib.BaseUtilLib.prototype, 'isWin32').mockImplementation(() => isWin);
const answers: testutils.BaseLibAnswers = {
  "exec": {
    [`${path.join(vcpkgRoot, vcpkgExe)} env --bin --include --tools --python --triplet ${triplet} set`]:
      { code: 0, stdout: vcpkgEnvOutput },
  },
};

describe("cmakeutils tests", function () {
  test("injectEnvVariables() should succeed", async () => {
    // Arrange.
    const answers2: testutils.BaseLibAnswers = {
      "exec": {
        [`${path.join(vcpkgRoot, vcpkgExe)} `]:
          { code: 0, stdout: vcpkgEnvOutput },
      },
    };
    mock.answersMocks.reset(answers2);

    const baseLib: BaseLib = mock.exportedBaselib;
    const baseUtilLib: baseutillib.BaseUtilLib = new baseutillib.BaseUtilLib(baseLib);

    // Act
    await cmakeutils.injectEnvVariables(baseUtilLib, vcpkgRoot, []);

    // Assert
    expect(process.env['A']).toBe('1');
    expect(process.env['B']).toBe('2');

    // Cleanup
    delete process.env['A'];
    delete process.env['B'];
  });

  test("injectEnvVariables() with args passed in.", async () => {
    // Arrange
    mock.answersMocks.reset(answers);

    cmakeutils.setEnvVarIfUndefined("VCPKG_DEFAULT_TRIPLET", baseUtilLib.getDefaultTriplet());
    const vcpkgEnvArgsString: string = baseutillib.replaceFromEnvVar(cmakerunner.CMakeRunner.vcpkgEnvDefault);
    const vcpkgEnvArgs: string[] = eval(vcpkgEnvArgsString);

    // Act
    await cmakeutils.injectEnvVariables(baseUtilLib, vcpkgRoot, vcpkgEnvArgs);

    // Assert
    expect(process.env['A']).toBe('1');
    expect(process.env['B']).toBe('2');
  });

  test("injectEnvVariables() with 'vcpkg env' failure (exit code 1)", async () => {
    // Arrange
    mock.answersMocks.reset(answers);

    const vcpkgEnvArgsString: string = baseutillib.replaceFromEnvVar(cmakerunner.CMakeRunner.vcpkgEnvDefault);
    const vcpkgEnvArgs: string[] = eval(vcpkgEnvArgsString);

    const answers2: testutils.BaseLibAnswers = {
      "exec": {
        [`${path.join(vcpkgRoot, vcpkgExe)} env --bin --include --tools --python --triplet ${triplet} set`]:
          { code: 1, stdout: "" },
      },
    };
    mock.answersMocks.reset(answers2);

    // Act and Assert
    await expect(() => cmakeutils.injectEnvVariables(baseUtilLib, vcpkgRoot, vcpkgEnvArgs)).rejects.toThrow();
  });
});
