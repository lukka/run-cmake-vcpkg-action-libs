// Copyright (c) 2020 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as path from 'path'
import * as baselib from '@lukka/base-lib'

const vcpkgAdditionalCachedPathsKey = "VCPKG_ADDITIONAL_CACHED_PATHS_KEY";

export function getOrdinaryCachedPaths(vcpkgRootDir: string): string[] {
  const pathsToCache: string[] = [
    vcpkgRootDir,
    path.normalize(`!${path.join(vcpkgRootDir, 'packages')}`),
    path.normalize(`!${path.join(vcpkgRootDir, 'buildtrees')}`),
    path.normalize(`!${path.join(vcpkgRootDir, 'downloads')}`)
  ];

  return pathsToCache;
}

export function getAllCachedPaths(baselib: baselib.BaseLib, vcpkgRootDir: string): string[] {
  let paths = getOrdinaryCachedPaths(vcpkgRootDir);
  const additionalPaths: string | undefined = baselib.getVariable(vcpkgAdditionalCachedPathsKey);
  if (additionalPaths)
    paths = paths.concat(...[';', additionalPaths]);
  return paths;
}

export function addCachedPaths(baselib: baselib.BaseLib, pathsSemicolonSeparated: string): void {
  baselib.debug(`Adding paths to be cached by run-vcpkg: ${pathsSemicolonSeparated}`);
  let cachedPaths = baselib.getVariable(vcpkgAdditionalCachedPathsKey);
  if (cachedPaths)
    cachedPaths = cachedPaths.concat(...[';', pathsSemicolonSeparated]);
  else
    cachedPaths = pathsSemicolonSeparated;
  baselib.setVariable(vcpkgAdditionalCachedPathsKey, cachedPaths);
  baselib.debug(`Full list of cached paths by run-vcpkg: ${cachedPaths}`);
}

