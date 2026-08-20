// Copyright (c) 2019-2020-2021-2022-2023-2024 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as baseutillib from '@lukka/base-util-lib';
import * as actionlib from '../src/action-lib';

jest.setTimeout(15 * 1000);

test('getDefaultBinDirName', async () => {
    // Arrange
    // Grab the static method to get the binary directory name.
    const getDefaultBinDirNameMethod = actionlib.ActionLib['getDefaultBinDirName'];
    // Grab the default value
    const defaultBinDirName = (actionlib.ActionLib as any).binDir

    // Act and test: default value must be returned.
    delete process.env[(actionlib.ActionLib as any).RUNVCPKG_BINDIR];
    expect(getDefaultBinDirNameMethod()).toStrictEqual(defaultBinDirName);

    // Arrange: set empty string for env var
    process.env[(actionlib.ActionLib as any).RUNVCPKG_BINDIR] = "";
    // Act and test: still the default must be returned.
    expect(getDefaultBinDirNameMethod()).toStrictEqual(defaultBinDirName);

    // Arrange: set a value to env var
    const expected = "1234";
    process.env[(actionlib.ActionLib as any).RUNVCPKG_BINDIR] = expected;
    // Act and test: the set value must be returned.
    expect(getDefaultBinDirNameMethod()).toStrictEqual(expected);
});

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

test('evaluateCmdStringFormat() positive tests', async () => {
    {
        expect(baseutillib.evaluateCmdStringFormat("[]")).toStrictEqual([]);

        process.env.CMDSTRINGFORMAT_ENVNAME = "envvalue";
        expect(baseutillib.evaluateCmdStringFormat("[`--build`, `--preset`, `$[env.CMDSTRINGFORMAT_ENVNAME]`]"))
            .toStrictEqual(["--build", "--preset", "envvalue"]);
        delete process.env.CMDSTRINGFORMAT_ENVNAME;

        expect(baseutillib.evaluateCmdStringFormat("[`--preset`, `$[name]`]", { "name": "value" }))
            .toStrictEqual(["--preset", "value"]);

        // Multiple quote styles and a placeholder embedded within literal text
        // are supported, and are not evaluated/executed.
        process.env.CMDSTRINGFORMAT_TRIPLET = "x64-linux";
        expect(baseutillib.evaluateCmdStringFormat("['env', \"--triplet\", `--triplet $[env.CMDSTRINGFORMAT_TRIPLET]`]"))
            .toStrictEqual(["env", "--triplet", "--triplet x64-linux"]);
        delete process.env.CMDSTRINGFORMAT_TRIPLET;
    }
});

test('evaluateCmdStringFormat() does not execute injected code from environment variables', async () => {
    {
        // An environment variable value crafted to try to break out of the
        // string literal and inject/execute arbitrary JavaScript must be
        // treated as plain text, and not executed.
        const malicious = "`); ((globalThis as any).INJECTED = true); (`";
        process.env.CMDSTRINGFORMAT_MALICIOUS = malicious;

        const result = baseutillib.evaluateCmdStringFormat("[`--preset`, `$[env.CMDSTRINGFORMAT_MALICIOUS]`]");

        expect(result).toStrictEqual(["--preset", malicious]);
        expect((globalThis as any).INJECTED).toBeUndefined();

        delete process.env.CMDSTRINGFORMAT_MALICIOUS;
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