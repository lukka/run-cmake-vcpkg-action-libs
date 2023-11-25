// Copyright (c) 2019-2020-2021-2022-2023 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as path from 'path';
import * as vcpkgutils from '../src/vcpkg-utils';

function excludedPath(base: string, postfix: string): string {
  return path.normalize(`!${path.join(base, postfix)}`);
}

test('tests for run-vcpkg utils.ts ...', async () => {
  const vcpkgRoot = "vcpkgRoot";
  const paths = vcpkgutils.getOrdinaryCachedPaths("vcpkgRoot");
  expect(paths).toStrictEqual(
    [path.join(vcpkgRoot, '*'),
    excludedPath(vcpkgRoot, "installed"),
    excludedPath(vcpkgRoot, "vcpkg_installed"),
    excludedPath(vcpkgRoot, "packages"),
    excludedPath(vcpkgRoot, "buildtrees"),
    excludedPath(vcpkgRoot, "downloads")]
  );
});
