// Copyright (c) 2019-2020-2021 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as assert from 'assert';
import * as path from 'path';
import * as baseutillib from '@lukka/base-util-lib';
import * as actionlibs from '../src/action-lib';

function readFile(path: string): [boolean, string] {
  if (path.indexOf("response_file_with_triplet.txt") !== -1) {
    return [true, "--dry-run\n --triplet\n triplet\n"];
  } else if (path.indexOf("response_file_only_with_triplet.txt") !== -1) {
    return [true, "--triplet\ntriplet\n"];
  } else {
    return [true, " triplet \nis \nnot \nspecified\n"];
  }
}

test('testing triplet extraction from arguments', async () => {
  assert.strictEqual(baseutillib.BaseUtilLib.extractTriplet("", readFile), null);
  assert.strictEqual(baseutillib.BaseUtilLib.extractTriplet("--triplet triplet", readFile), "triplet");
  assert.strictEqual(baseutillib.BaseUtilLib.extractTriplet("--dry-run --triplet triplet", readFile), "triplet");
  assert.strictEqual(baseutillib.BaseUtilLib.extractTriplet("--dry-run --triplet tri-plet ", readFile), "tri-plet");
  assert.strictEqual(baseutillib.BaseUtilLib.extractTriplet("--dry-run --triplet  tri-plet --dry-run", readFile), "tri-plet");
  assert.strictEqual(baseutillib.BaseUtilLib.extractTriplet("--dry-run --triplet ", readFile), null);
  assert.strictEqual(baseutillib.BaseUtilLib.extractTriplet("--dry-run @response_file_with_triplet.txt --triplet x", readFile), "triplet");
  assert.strictEqual(baseutillib.BaseUtilLib.extractTriplet("--dry-run @response_file_with_no_triplet.txt --triplet x", readFile), "x");
  assert.strictEqual(baseutillib.BaseUtilLib.extractTriplet("--dry-run @response_file_with_no_triplet.txt ", readFile), null);
  assert.strictEqual(baseutillib.BaseUtilLib.extractTriplet("--recursive @response_file_only_with_triplet.txt", readFile), "triplet");
});







const BaseUtilLib: baseutillib.BaseUtilLib = new baseutillib.BaseUtilLib(new actionlibs.ActionLib());


describe('baselibs utils tests', function () {
  test('testing for presence of flags', async () => {
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

  test('testing for path normalization', async () => {
    assert.strictEqual(baseutillib.BaseUtilLib.normalizePath('/a/path/'), path.join('/a', 'path'));
    assert.strictEqual(baseutillib.BaseUtilLib.normalizePath('/a/../path/'), path.normalize('/path'));
    assert.strictEqual(baseutillib.BaseUtilLib.normalizePath('/'), path.normalize('/'));
    assert.strictEqual(baseutillib.BaseUtilLib.normalizePath('/a'), path.normalize('/a'));
    assert.strictEqual(baseutillib.BaseUtilLib.normalizePath('/a/'), path.normalize('/a'));
    assert.strictEqual(baseutillib.BaseUtilLib.normalizePath('/a/path'), path.join('/a', 'path'));
  });
});


