// Copyright (c) 2019-2020-2021 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as assert from 'assert';
import * as utils from '../src/utils'
import * as baseutillib from '@lukka/base-util-lib'
import * as actionlib from '@lukka/action-lib'
import path from 'path'
import * as mock from '../../run-vcpkg-lib/__tests__/mocks'
import * as testutils from '../../run-vcpkg-lib/__tests__/utils'
import { BaseLib } from '@lukka/base-lib';

const vcpkgRoot = "/vcpkgroot/";
const vcpkgCMakeToolchain = path.join(vcpkgRoot, "scripts/buildsystems/vcpkg.cmake");
const isWin = process.platform === "win32";
const triplet = "triplet";
const vcpkgEnvOutput = "vcpkg env's output:\nA=1\nB=2\n";
jest.spyOn(baseutillib.BaseUtilLib.prototype, 'isWin32').mockImplementation(() => isWin);
const answers: testutils.BaseLibAnswers = {
  "exec": {
    [`${path.join(vcpkgRoot, 'vcpkg.exe')} env --bin --include --tools --python --triplet ${triplet} set`]:
      { code: 0, stdout: vcpkgEnvOutput },
    [`${path.join(vcpkgRoot, 'vcpkg')} env --bin --include --tools --python --triplet ${triplet} set`]:
      { code: 0, stdout: vcpkgEnvOutput },
  },
};

describe('BaseUtilLib tests', function () {
  test('testing for presence of CMake flags', async () => {
    const actionLib: actionlib.ActionLib = new actionlib.ActionLib();
    const BaseUtilLib: baseutillib.BaseUtilLib = new baseutillib.BaseUtilLib(actionLib);

    assert.ok(BaseUtilLib.isToolchainFile(['-DCMAKE_TOOLCHAIN_FILE']));
    assert.ok(BaseUtilLib.isToolchainFile([' -DCMAKE_TOOLCHAIN_FILE']));
    assert.ok(!BaseUtilLib.isToolchainFile([' -dCMAKE_TOOLCHAIN_FILE']));

    assert.ok(BaseUtilLib.removeToolchainFile([' -DCMAKE_TOOLCHAIN_FILE=/path/to/file.cmake ']).length === 0);
    assert.ok(BaseUtilLib.removeToolchainFile([' -DCMAKE_TOOLCHAIN_FILE:FILEPATH=/path/to/file.cmake ']).length === 0);
    assert.ok(BaseUtilLib.removeToolchainFile([' -DCMAKE_TOOLCHAIN_FILE:FILE=/path/to/file.cmake ']).length === 0);
    assert.ok(BaseUtilLib.removeToolchainFile([' -DCMAKE_TOOLCHAIN_FILE:STRING="/path/to/file.cmake" ']).length === 0);
    assert.ok(BaseUtilLib.removeToolchainFile([' -DCMAKE_TOOLCHAIN_FILE="/path/to/file.cmake" ']).length === 0);
    assert.deepEqual(BaseUtilLib.removeToolchainFile(['-DVAR=NAME', '-DCMAKE_TOOLCHAIN_FILE=/path/to/file.cmake']), ['-DVAR=NAME']);
    assert.deepEqual(BaseUtilLib.removeToolchainFile(['-DVAR=NAME ', '-DCMAKE_TOOLCHAIN_FILE="/path/to/file.cmake"']), ['-DVAR=NAME ']);
    assert.deepEqual(BaseUtilLib.removeToolchainFile(['-DVAR=NAME ', ' -DCMAKE_TOOLCHAIN_FILE=c:\\path\\to\\file.cmake']), ['-DVAR=NAME ']);
    assert.ok(BaseUtilLib.isToolchainFile([' -DCMAKE_TOOLCHAIN_FILE=/path/to/file.cmake ']));
    assert.ok(!BaseUtilLib.isToolchainFile([' -DVAR=NAME ']));
  });

});

describe("CMakeUtils tests", function () {
  test("CMakeUtils.injectVcpkgToolchain tests", async () => {
    mock.answersMocks.reset(answers);

    const baseLib: BaseLib = mock.exportedBaselib;
    const baseUtilLib: baseutillib.BaseUtilLib = new baseutillib.BaseUtilLib(baseLib);
    const cmakeUtils = new utils.CMakeUtils(baseUtilLib);

    process.env.RUNVCPKG_VCPKG_ROOT = vcpkgRoot;

    const ret1: string[] = await cmakeUtils.injectVcpkgToolchain(['-DCMAKE_TOOLCHAIN_FILE=existing.cmake'], "triplet", baseLib);
    assert.deepStrictEqual(ret1, [`-DCMAKE_TOOLCHAIN_FILE=${vcpkgCMakeToolchain}`, '-DVCPKG_CHAINLOAD_TOOLCHAIN_FILE=existing.cmake', '-DVCPKG_TARGET_TRIPLET=triplet']);

    const ret2 = await cmakeUtils.injectVcpkgToolchain(['-DCMAKE_TOOLCHAIN_FILE:FILEPATH=existing.cmake'], "triplet", baseLib);
    assert.deepStrictEqual(ret2, [`-DCMAKE_TOOLCHAIN_FILE=${vcpkgCMakeToolchain}`, '-DVCPKG_CHAINLOAD_TOOLCHAIN_FILE=existing.cmake', '-DVCPKG_TARGET_TRIPLET=triplet']);

    const ret3 = await cmakeUtils.injectVcpkgToolchain(['-DCMAKE_BUILD_TYPE=Debug'], "triplet", baseLib);
    assert.deepStrictEqual(ret3, ['-DCMAKE_BUILD_TYPE=Debug', `-DCMAKE_TOOLCHAIN_FILE=${vcpkgCMakeToolchain}`, '-DVCPKG_TARGET_TRIPLET=triplet']);

    process.env.RUNVCPKG_VCPKG_ROOT = "";
    const arg: string[] = [' -DCMAKE_BUILD_TYPE=Debug'];
    const ret4 = await cmakeUtils.injectVcpkgToolchain(arg, "triplet", baseLib);
    assert.deepStrictEqual(ret4, arg);
  });

  test("CMakeUtils.injectEnvVariables tests", async () => {
    mock.answersMocks.reset(answers);

    const baseLib: BaseLib = mock.exportedBaselib;
    const baseUtilLib: baseutillib.BaseUtilLib = new baseutillib.BaseUtilLib(baseLib);
    const cmakeUtils = new utils.CMakeUtils(baseUtilLib);

    // test with vcpkgRoot passed in.
    await cmakeUtils.injectEnvVariables(vcpkgRoot, triplet, baseLib);

    // test with vcpkgRoot not passed in, but VCPKG_ROOT defined
    process.env.RUNVCPKG_VCPKG_ROOT = vcpkgRoot;
    await cmakeUtils.injectEnvVariables(null, triplet, baseLib);

    // test with vcpkgRoot not passed in and VCPKG_ROOT undefined
    delete process.env.RUNVCPKG_VCPKG_ROOT;
    await expect(cmakeUtils.injectEnvVariables(null, triplet, baseLib)).rejects.toThrow();


    // test with vcpkg failure (exit code 1).
    const answers2: testutils.BaseLibAnswers = {
      "exec": {
        [`${path.join(vcpkgRoot, 'vcpkg')} env --bin --include --tools --python --triplet ${triplet} set`]:
          { code: 1, stdout: "" },
      },
    };
    mock.answersMocks.reset(answers2);
    await expect(cmakeUtils.injectEnvVariables(vcpkgRoot, triplet, baseLib)).rejects.toThrow();
  });
});
