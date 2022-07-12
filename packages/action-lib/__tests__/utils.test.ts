// Copyright (c) 2019-2020-2021-2022 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as baseutillib from '@lukka/base-util-lib';
import * as actionlibs from '../src/action-lib';
import * as lib from '../src/action-lib'

jest.setTimeout(15 * 1000);

test('replaceFromEnvVar() positive tests', async () => {
    {
        expect(baseutillib.replaceFromEnvVar("")).toStrictEqual("");
        expect(baseutillib.replaceFromEnvVar("$[name]", { "name": "value" })).toStrictEqual("value");
        process.env.ENVNAME = "envvalue";
        expect(baseutillib.replaceFromEnvVar("$[env.ENVNAME]", { "name": "value" })).toStrictEqual("envvalue");

        expect(baseutillib.replaceFromEnvVar("text $[env.ENVNAME] ${aaa} $[bbb] text $[undef]", { "bbb": "bbb-value" })).toStrictEqual("text envvalue ${aaa} bbb-value text undef-is-undefined");

        // Tests for dropped slashes as reported in https://github.com/lukka/run-vcpkg/issues/130
        const VARNAME = "ENVNAME";
        {
            const value = "d:\\a\\b\\c";
            const expectedValue = "d:\\\\a\\\\b\\\\c";
            process.env[VARNAME] = value;
            expect(baseutillib.replaceFromEnvVar("text $[env.ENVNAME]", {})).toStrictEqual(`text ${expectedValue}`);
            delete process.env[VARNAME];
        }
        {
            const value = "d:/a/b/c";
            process.env[VARNAME] = value;
            expect(baseutillib.replaceFromEnvVar("text $[env.ENVNAME]", {})).toStrictEqual(`text ${value}`);
            delete process.env[VARNAME];
        }
    }
});

test('replaceFromEnvVar() negative tests', async () => {
    {
        expect(baseutillib.replaceFromEnvVar("normal-text")).toStrictEqual("normal-text");
        expect(baseutillib.replaceFromEnvVar("$[name]", { "NAME": "value" })).toStrictEqual("name-is-undefined");
        delete process.env.ENVNAME;
        expect(baseutillib.replaceFromEnvVar("$[env.ENVNAME]", { "envname": "value" })).toStrictEqual("ENVNAME-is-undefined");

        expect(baseutillib.replaceFromEnvVar("text $[env.u] $[u] ${aaa} $[bbb] text $[undef]", { "bbb": "bbb-value" })).
            toStrictEqual("text u-is-undefined u-is-undefined ${aaa} bbb-value text undef-is-undefined");
    }
});

test('KeySet tests', async () => {
    {
        expect((a: []) => baseutillib.createKeySet(a)).toThrow(Error);
    }

    {
        expect(baseutillib.createKeySet(["aaa", "bbb", "ccc", "ddd"])).toStrictEqual({
            primary: "aaa_bbb_ccc_ddd",
            restore: [
                "aaa_bbb_ccc",
                "aaa_bbb",
                "aaa"]
        });
    }

    {
        expect(baseutillib.createKeySet(["1", "", "3"])).toStrictEqual({ primary: "1__3", restore: ["1_", "1"] });
    }
});