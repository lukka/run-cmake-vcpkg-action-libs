// Copyright (c) 2019-2020-2021 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as path from 'path';
import * as vcpkgutils from '../src/utils';

function normalizePath(base: string, postfix: string): string {
  return path.normalize(`!${path.join(base, postfix)}`);
}

test('tests for run-vcpkg utils.ts ...', async () => {
  const vcpkgRoot = "vcpkgRoot";
  const paths = vcpkgutils.getOrdinaryCachedPaths("vcpkgRoot");
  expect(paths).toStrictEqual(
    [vcpkgRoot,
      normalizePath(vcpkgRoot, "packages"),
      normalizePath(vcpkgRoot, "buildtrees"),
      normalizePath(vcpkgRoot, "downloads")]
  );
});

