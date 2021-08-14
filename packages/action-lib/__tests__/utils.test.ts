// Copyright (c) 2019-2020-2021 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as baseutillib from '@lukka/base-util-lib';
import * as actionlibs from '../src/action-lib';
import * as lib from '../src/action-lib'

jest.setTimeout(15 * 1000);

test('KeySet tests', async () => {
    {
        expect((a: []) => baseutillib.CreateKeySet(a)).toThrow(Error);
    }

    {
        expect(baseutillib.CreateKeySet(["aaa", "bbb", "ccc", "ddd"])).toStrictEqual({
            primary: "aaa_bbb_ccc_ddd",
            restore: [
                "aaa_bbb_ccc",
                "aaa_bbb",
                "aaa"]
        });
    }

    {
        expect(baseutillib.CreateKeySet(["1", "", "3"])).toStrictEqual({ primary: "1__3", restore: ["1_", "1"] });
    }
});