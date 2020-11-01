// Copyright (c) 2019-2020 Luca Cappa
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
jest.spyOn(baseutillib.BaseUtilLib.prototype, 'isWin32').mockImplementation(() => isWin);
const answers: testutils.BaseLibAnswers = {
  "exec": {
    [`${path.join(vcpkgRoot, 'vcpkg.exe')} env --bin --include --tools --python --triplet triplet set`]:
      { code: 0, stdout: "vcpkg output" },
  },
};

describe('BaseUtilLib tests', function () {
  test('testing for presence of CMake flags', async () => {
    const actionLib: actionlib.ActionLib = new actionlib.ActionLib();
    const BaseUtilLib: baseutillib.BaseUtilLib = new baseutillib.BaseUtilLib(actionLib);
    assert.ok(BaseUtilLib.isNinjaGenerator(['-GNinja']));
    assert.ok(BaseUtilLib.isNinjaGenerator(['-G Ninja']));
    assert.ok(!BaseUtilLib.isNinjaGenerator(['-G ninja']));
    assert.ok(!BaseUtilLib.isNinjaGenerator(['-g Ninja']));
    assert.ok(!BaseUtilLib.isNinjaGenerator(['-Gninja']));
    assert.ok(BaseUtilLib.isNinjaGenerator(['-G"Ninja"']));
    assert.ok(BaseUtilLib.isNinjaGenerator(['-G Ninja"']));
    assert.ok(BaseUtilLib.isNinjaGenerator(['-G  Ninja"']));
    assert.ok(BaseUtilLib.isNinjaGenerator(['-G  "Ninja"']));
    assert.ok(!BaseUtilLib.isNinjaGenerator(['-G  "Ninja']));
    assert.ok(!BaseUtilLib.isNinjaGenerator(['-g"Ninja"']));
    assert.ok(!BaseUtilLib.isNinjaGenerator(['-gNinja']));
    assert.ok(!BaseUtilLib.isNinjaGenerator(['-g"Ninja']));

    assert.ok(BaseUtilLib.isMakeProgram(['-DCMAKE_MAKE_PROGRAM=']));
    assert.ok(!BaseUtilLib.isMakeProgram(['-D CMAKE_MAKE_PROGRAM=']));
    assert.ok(!BaseUtilLib.isMakeProgram(['-dCMAKE_MAKE_PROGRAM=']));
    assert.ok(!BaseUtilLib.isMakeProgram(['-d CMAKE_MAKE_PROGRAM=']));
    assert.ok(!BaseUtilLib.isMakeProgram(['']));
    assert.ok(!BaseUtilLib.isMakeProgram([' ']));

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

    //const actionLib: actionlib.ActionLib = new actionlib.ActionLib();
    const baseLib: BaseLib = mock.exportedBaselib;
    const BaseUtilLib: baseutillib.BaseUtilLib = new baseutillib.BaseUtilLib(baseLib);
    const cmakeUtils = new utils.CMakeUtils(BaseUtilLib);

    process.env.RUNVCPKG_VCPKG_ROOT = vcpkgRoot;
    let ret: string[] = await cmakeUtils.injectVcpkgToolchain(['-DCMAKE_TOOLCHAIN_FILE=existing.cmake'], "triplet", baseLib);
    assert.deepEqual(ret, [`-DCMAKE_TOOLCHAIN_FILE=${vcpkgCMakeToolchain}`, '-DVCPKG_CHAINLOAD_TOOLCHAIN_FILE=existing.cmake', '-DVCPKG_TARGET_TRIPLET=triplet']);
    ret = await cmakeUtils.injectVcpkgToolchain(['-DCMAKE_TOOLCHAIN_FILE:FILEPATH=existing.cmake'], "triplet", baseLib);
    assert.deepEqual(ret, [`-DCMAKE_TOOLCHAIN_FILE=${vcpkgCMakeToolchain}`, '-DVCPKG_CHAINLOAD_TOOLCHAIN_FILE=existing.cmake', '-DVCPKG_TARGET_TRIPLET=triplet']);
    ret = await cmakeUtils.injectVcpkgToolchain(['-DCMAKE_BUILD_TYPE=Debug'], "triplet", baseLib);
    assert.deepEqual(ret, ['-DCMAKE_BUILD_TYPE=Debug', `-DCMAKE_TOOLCHAIN_FILE=${vcpkgCMakeToolchain}`, '-DVCPKG_TARGET_TRIPLET=triplet']);

    process.env.RUNVCPKG_VCPKG_ROOT = "";
    const arg: string[] = [' -DCMAKE_BUILD_TYPE=Debug'];
    ret = await cmakeUtils.injectVcpkgToolchain(arg, "triplet", baseLib);
    assert.deepEqual(ret, arg);
  });
});
