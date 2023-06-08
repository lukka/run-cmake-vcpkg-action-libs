// Copyright (c) 2019-2020-2021-2022 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as cmakeutils from '../src/cmake-utils'
import * as cmakerunner from '../src/cmake-runner'
import * as baseutillib from '@lukka/base-util-lib'
import path from 'path'
import * as mock from '../../run-vcpkg-lib/__tests__/mocks'
import * as testutils from '../../run-vcpkg-lib/__tests__/utils'
import { BaseLib } from '@lukka/base-lib';

function newUniqueName() {
  return 'xxxxxxxxxxxxyxxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0,
      v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function getVcpkgEnvOutput(var1: string, var2: string) {
  return `vcpkg env's output:\n${var1}=1\n${var2}=2\n`;
}

const baseLib: BaseLib = mock.exportedBaselib;
const baseUtilLib: baseutillib.BaseUtilLib = new baseutillib.BaseUtilLib(baseLib);
const vcpkgRoot = "/vcpkgroot/";
const vcpkgExe = path.join(vcpkgRoot, 'vcpkg.exe')
mock.VcpkgMocks.vcpkgExePath = vcpkgExe;
const defaultTriplet = "default-triplet";
// Run as it is Windows OS on any test run.
jest.spyOn(baseutillib.BaseUtilLib.prototype, 'isWin32').mockImplementation(() => true);

describe("cmakeutils tests", function () {
  test("setupMsvc() should succeed", async () => {
    // Arrange.
    const baseLib: BaseLib = mock.exportedBaselib;
    const baseUtilLib: baseutillib.BaseUtilLib = new baseutillib.BaseUtilLib(baseLib);
    const msvcVariable1 = newUniqueName();
    const msvcVariable2 = newUniqueName();
    const answers2: testutils.BaseLibAnswers = {
      "exec": {
        [`${vcpkgExe} `]:
          { code: 0, stdout: getVcpkgEnvOutput(msvcVariable1, msvcVariable2) },
      },
    };
    baseutillib.setEnvVarIfUndefined("VCPKG_DEFAULT_TRIPLET", defaultTriplet);
    let envVarSetCount = 0;
    mock.answersMocks.reset(answers2);
    jest.spyOn(baseUtilLib, 'setEnvVar').mockImplementation((name, value) => {
      switch (name) {
        case 'CC': envVarSetCount++; break;
        case 'CXX': envVarSetCount++; break;
        default:
          throw `unexpected name:'${name}' value:'${value}'`;
      }
    });

    // Act
    await cmakeutils.setupMsvc(baseUtilLib, vcpkgRoot, "[]");

    // Assert
    // CC, CXX and nothing else should be set. Its value are checked in the setEnvVar()'s mock.
    expect(envVarSetCount).toEqual(2);
    expect(process.env[msvcVariable1]).toStrictEqual('1');
    expect(process.env[msvcVariable2]).toStrictEqual('2');
  });

  test("setupMsvc() should warn user about non existent vcpkg's exe", async () => {
    // Arrange.
    process.env.VCPKG_ROOT = "non-existent-path";
    const answers2: testutils.BaseLibAnswers = {};
    mock.answersMocks.reset(answers2);
    const baseLib: BaseLib = mock.exportedBaselib;
    const warningMock = jest.spyOn(baseLib, 'warning');
    const baseUtilLib: baseutillib.BaseUtilLib = new baseutillib.BaseUtilLib(baseLib);
    jest.spyOn(baseUtilLib, 'setEnvVar').mockImplementation((name, value) => {
      switch (name) {
        default:
          throw `unexpected name '${name}' value '${value}'`;
      }
    });
    // Tells there is not vcpkg.exe on disk.
    mock.VcpkgMocks.vcpkgExeExists = false;;

    // Act
    await cmakeutils.setupMsvc(baseUtilLib, vcpkgRoot, "[]");

    // Assert
    expect(warningMock).toBeCalledTimes(1);

    // Cleanup
    warningMock.mockRestore();
  });


  test("setupMsvc() with args passed in.", async () => {
    // Arrange
    const msvcVariable1 = newUniqueName();
    const msvcVariable2 = newUniqueName();
    const answers: testutils.BaseLibAnswers = {
      "exec": {
        [`${vcpkgExe} env --bin --include --tools --python --triplet ${defaultTriplet} set`]:
          { code: 0, stdout: getVcpkgEnvOutput(msvcVariable1, msvcVariable2) },
      },
    };
    mock.answersMocks.reset(answers);
    jest.spyOn(baseUtilLib, 'setEnvVar').mockImplementation((name, value) => {
      switch (name) {
        case 'CC': envVarSetCount++; break;
        case 'CXX': envVarSetCount++; break;
        default:
          throw `unexpected name:'${name}' value:'${value}'`;
      }
    });
    mock.VcpkgMocks.vcpkgExeExists = true;
    let envVarSetCount = 0;
    baseutillib.setEnvVarIfUndefined("VCPKG_DEFAULT_TRIPLET", defaultTriplet);

    // Act
    await cmakeutils.setupMsvc(baseUtilLib, vcpkgRoot,
      cmakerunner.CMakeRunner.vcpkgEnvDefault);

    // Assert
    // CC, CXX and the two env var must be set. Its value are checked in the setEnvVar()'s mock.
    expect(envVarSetCount).toEqual(2);
    expect(process.env[msvcVariable1]).toStrictEqual('1');
    expect(process.env[msvcVariable2]).toStrictEqual('2');
  });

  test("setupMsvc() with 'vcpkg env' failure (exit code 1)", async () => {
    // Arrange
    mock.VcpkgMocks.vcpkgExeExists = true;
    const answers2: testutils.BaseLibAnswers = {
      "exec": {
        [`${vcpkgExe} env --bin --include --tools --python --triplet ${defaultTriplet} set`]:
          { code: 1, stdout: "" },
      },
    };
    mock.answersMocks.reset(answers2);

    // Act and Assert
    await expect(async () => await cmakeutils.setupMsvc(baseUtilLib, vcpkgRoot,
      cmakerunner.CMakeRunner.vcpkgEnvDefault)).rejects.toThrow();

  });

  test("setupMsvc() must not set environment if non Windows host", async () => {
    jest.spyOn(baseUtilLib, 'setEnvVar').mockImplementation((name, value) => {
      switch (name) {
        default:
          throw `Must not set the environment (name:'${name}', value:'${value}')`;
      }
    });
    mock.VcpkgMocks.vcpkgExeExists = true;
    // Run as non Windows OS.
    jest.spyOn(baseutillib.BaseUtilLib.prototype, 'isWin32').mockImplementation(() => false);
    baseutillib.setEnvVarIfUndefined("VCPKG_DEFAULT_TRIPLET", defaultTriplet);
    const injectMock = jest.spyOn(cmakeutils, 'injectEnvVariables');
    const warningMock = jest.spyOn(baseLib, 'warning');

    // Act
    await cmakeutils.setupMsvc(baseUtilLib, vcpkgRoot,
      cmakerunner.CMakeRunner.vcpkgEnvDefault);

    // Assert
    // Must not setup the environment
    expect(injectMock).toBeCalledTimes(0);
    // No warning messages, only info msg with: 'Skipping setting up the environment since the platform is not Windows'
    expect(warningMock).toBeCalledTimes(0);

    // Cleanup
    injectMock.mockRestore();
    warningMock.mockRestore();
  });

});
