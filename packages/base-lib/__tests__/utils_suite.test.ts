// Copyright (c) 2019-2020 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as assert from 'assert';

import * as baselib from '../src/utils'

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
  assert.strictEqual(baselib.BaseLibUtils.extractTriplet("", readFile), null);
  assert.strictEqual(baselib.BaseLibUtils.extractTriplet("--triplet triplet", readFile), "triplet");
  assert.strictEqual(baselib.BaseLibUtils.extractTriplet("--dry-run --triplet triplet", readFile), "triplet");
  assert.strictEqual(baselib.BaseLibUtils.extractTriplet("--dry-run --triplet tri-plet ", readFile), "tri-plet");
  assert.strictEqual(baselib.BaseLibUtils.extractTriplet("--dry-run --triplet  tri-plet --dry-run", readFile), "tri-plet");
  assert.strictEqual(baselib.BaseLibUtils.extractTriplet("--dry-run --triplet ", readFile), null);
  assert.strictEqual(baselib.BaseLibUtils.extractTriplet("--dry-run @response_file_with_triplet.txt --triplet x", readFile), "triplet");
  assert.strictEqual(baselib.BaseLibUtils.extractTriplet("--dry-run @response_file_with_no_triplet.txt --triplet x", readFile), "x");
  assert.strictEqual(baselib.BaseLibUtils.extractTriplet("--dry-run @response_file_with_no_triplet.txt ", readFile), null);
  assert.strictEqual(baselib.BaseLibUtils.extractTriplet("--recursive @response_file_only_with_triplet.txt", readFile), "triplet");
});

