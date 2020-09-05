// Copyright (c) 2019-2020 Luca Cappa
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
  assert.strictEqual(baseutillib.BaseLibUtils.extractTriplet("", readFile), null);
  assert.strictEqual(baseutillib.BaseLibUtils.extractTriplet("--triplet triplet", readFile), "triplet");
  assert.strictEqual(baseutillib.BaseLibUtils.extractTriplet("--dry-run --triplet triplet", readFile), "triplet");
  assert.strictEqual(baseutillib.BaseLibUtils.extractTriplet("--dry-run --triplet tri-plet ", readFile), "tri-plet");
  assert.strictEqual(baseutillib.BaseLibUtils.extractTriplet("--dry-run --triplet  tri-plet --dry-run", readFile), "tri-plet");
  assert.strictEqual(baseutillib.BaseLibUtils.extractTriplet("--dry-run --triplet ", readFile), null);
  assert.strictEqual(baseutillib.BaseLibUtils.extractTriplet("--dry-run @response_file_with_triplet.txt --triplet x", readFile), "triplet");
  assert.strictEqual(baseutillib.BaseLibUtils.extractTriplet("--dry-run @response_file_with_no_triplet.txt --triplet x", readFile), "x");
  assert.strictEqual(baseutillib.BaseLibUtils.extractTriplet("--dry-run @response_file_with_no_triplet.txt ", readFile), null);
  assert.strictEqual(baseutillib.BaseLibUtils.extractTriplet("--recursive @response_file_only_with_triplet.txt", readFile), "triplet");
});







const baseLibUtils: baseutillib.BaseLibUtils = new baseutillib.BaseLibUtils(new actionlibs.ActionLib());


describe('baselibs utils tests', function () {
  test('testing for presence of flags', async () => {
    assert.ok(baseLibUtils.isNinjaGenerator(['-GNinja']));
    assert.ok(baseLibUtils.isNinjaGenerator(['-G Ninja']));
    assert.ok(!baseLibUtils.isNinjaGenerator(['-G ninja']));
    assert.ok(!baseLibUtils.isNinjaGenerator(['-g Ninja']));
    assert.ok(!baseLibUtils.isNinjaGenerator(['-Gninja']));
    assert.ok(baseLibUtils.isNinjaGenerator(['-G"Ninja"']));
    assert.ok(baseLibUtils.isNinjaGenerator(['-G Ninja"']));
    assert.ok(baseLibUtils.isNinjaGenerator(['-G  Ninja"']));
    assert.ok(baseLibUtils.isNinjaGenerator(['-G  "Ninja"']));
    assert.ok(!baseLibUtils.isNinjaGenerator(['-G  "Ninja']));
    assert.ok(!baseLibUtils.isNinjaGenerator(['-g"Ninja"']));
    assert.ok(!baseLibUtils.isNinjaGenerator(['-gNinja']));
    assert.ok(!baseLibUtils.isNinjaGenerator(['-g"Ninja']));

    assert.ok(baseLibUtils.isMakeProgram(['-DCMAKE_MAKE_PROGRAM=']));
    assert.ok(!baseLibUtils.isMakeProgram(['-D CMAKE_MAKE_PROGRAM=']));
    assert.ok(!baseLibUtils.isMakeProgram(['-dCMAKE_MAKE_PROGRAM=']));
    assert.ok(!baseLibUtils.isMakeProgram(['-d CMAKE_MAKE_PROGRAM=']));
    assert.ok(!baseLibUtils.isMakeProgram(['']));
    assert.ok(!baseLibUtils.isMakeProgram([' ']));

    assert.ok(baseLibUtils.isToolchainFile(['-DCMAKE_TOOLCHAIN_FILE']));
    assert.ok(baseLibUtils.isToolchainFile([' -DCMAKE_TOOLCHAIN_FILE']));
    assert.ok(!baseLibUtils.isToolchainFile([' -dCMAKE_TOOLCHAIN_FILE']));

    assert.ok(baseLibUtils.removeToolchainFile([' -DCMAKE_TOOLCHAIN_FILE=/path/to/file.cmake ']).length === 0);
    assert.ok(baseLibUtils.removeToolchainFile([' -DCMAKE_TOOLCHAIN_FILE:FILEPATH=/path/to/file.cmake ']).length === 0);
    assert.ok(baseLibUtils.removeToolchainFile([' -DCMAKE_TOOLCHAIN_FILE:FILE=/path/to/file.cmake ']).length === 0);
    assert.ok(baseLibUtils.removeToolchainFile([' -DCMAKE_TOOLCHAIN_FILE:STRING="/path/to/file.cmake" ']).length === 0);
    assert.ok(baseLibUtils.removeToolchainFile([' -DCMAKE_TOOLCHAIN_FILE="/path/to/file.cmake" ']).length === 0);
    assert.deepEqual(baseLibUtils.removeToolchainFile(['-DVAR=NAME', '-DCMAKE_TOOLCHAIN_FILE=/path/to/file.cmake']), ['-DVAR=NAME']);
    assert.deepEqual(baseLibUtils.removeToolchainFile(['-DVAR=NAME ', '-DCMAKE_TOOLCHAIN_FILE="/path/to/file.cmake"']), ['-DVAR=NAME ']);
    assert.deepEqual(baseLibUtils.removeToolchainFile(['-DVAR=NAME ', ' -DCMAKE_TOOLCHAIN_FILE=c:\\path\\to\\file.cmake']), ['-DVAR=NAME ']);
    assert.ok(baseLibUtils.isToolchainFile([' -DCMAKE_TOOLCHAIN_FILE=/path/to/file.cmake ']));
    assert.ok(!baseLibUtils.isToolchainFile([' -DVAR=NAME ']));
  });

  test('testing for path normalization', async () => {
    assert.strictEqual(baseutillib.BaseLibUtils.normalizePath('/a/path/'), path.join('/a', 'path'));
    assert.strictEqual(baseutillib.BaseLibUtils.normalizePath('/a/../path/'), path.normalize('/path'));
    assert.strictEqual(baseutillib.BaseLibUtils.normalizePath('/'), path.normalize('/'));
    assert.strictEqual(baseutillib.BaseLibUtils.normalizePath('/a'), path.normalize('/a'));
    assert.strictEqual(baseutillib.BaseLibUtils.normalizePath('/a/'), path.normalize('/a'));
    assert.strictEqual(baseutillib.BaseLibUtils.normalizePath('/a/path'), path.join('/a', 'path'));
  });
});


