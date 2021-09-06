// Copyright (c) 2019-2020-2021 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as utils from '../src/utils'
import * as baseutillib from '@lukka/base-util-lib'
import path from 'path'
import * as mock from '../../run-vcpkg-lib/__tests__/mocks'
import * as testutils from '../../run-vcpkg-lib/__tests__/utils'
import { BaseLib } from '@lukka/base-lib';

const vcpkgRoot = "/vcpkgroot/";
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

describe("CMakeUtils tests", function () {
  test("CMakeUtils.injectVcpkgToolchain tests", async () => {
    mock.answersMocks.reset(answers);

    const baseLib: BaseLib = mock.exportedBaselib;
    const baseUtilLib: baseutillib.BaseUtilLib = new baseutillib.BaseUtilLib(baseLib);
    const cmakeUtils = new utils.CMakeUtils(baseUtilLib);

    process.env.RUNVCPKG_VCPKG_ROOT = vcpkgRoot;

    await cmakeUtils.setEnvironmentForVcpkgTriplet("triplet", baseLib);

    await cmakeUtils.setEnvironmentForVcpkgTriplet("triplet", baseLib);

    await cmakeUtils.setEnvironmentForVcpkgTriplet("triplet", baseLib);

    await cmakeUtils.setEnvironmentForVcpkgTriplet("triplet", baseLib);
  });

  test("CMakeUtils.injectEnvVariables tests", async () => {
    mock.answersMocks.reset(answers);

    const baseLib: BaseLib = mock.exportedBaselib;
    const baseUtilLib: baseutillib.BaseUtilLib = new baseutillib.BaseUtilLib(baseLib);
    const cmakeUtils = new utils.CMakeUtils(baseUtilLib);

    // test with vcpkgRoot passed in.
    await cmakeUtils.injectEnvVariables(vcpkgRoot, triplet, baseLib);

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
