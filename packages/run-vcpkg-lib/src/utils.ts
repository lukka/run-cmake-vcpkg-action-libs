// Copyright (c) 2020 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as path from 'path'

export function getOrdinaryCachedPaths(vcpkgRootDir: string): string[] {
  const pathsToCache: string[] = [
    vcpkgRootDir,
    path.normalize(`!${path.join(vcpkgRootDir, 'packages')}`),
    path.normalize(`!${path.join(vcpkgRootDir, 'buildtrees')}`),
    path.normalize(`!${path.join(vcpkgRootDir, 'downloads')}`)
  ];

  return pathsToCache;
}


