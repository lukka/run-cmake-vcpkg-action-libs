// Copyright (c) 2020-2021-2022-2023 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as path from 'path'
import * as baselib from '@lukka/base-lib'

/**
 * 
 * @param vcpkgRootDir The VCPKG_ROOT directory.
 * @returns The list of paths to cache, and the ones to not cache (with the exclamation mark prefix).
 */
export function getOrdinaryCachedPaths(vcpkgRootDir: string): string[] {
  const pathsToCache: string[] = [
    path.join(vcpkgRootDir, '*'),
    path.normalize(`!${path.join(vcpkgRootDir, 'installed')}`),
    path.normalize(`!${path.join(vcpkgRootDir, 'vcpkg_installed')}`),
    path.normalize(`!${path.join(vcpkgRootDir, 'packages')}`),
    path.normalize(`!${path.join(vcpkgRootDir, 'buildtrees')}`),
    path.normalize(`!${path.join(vcpkgRootDir, 'downloads')}`)
  ];

  return pathsToCache;
}

export async function getDefaultVcpkgDirectory(baseLib: baselib.BaseLib,): Promise<string> {
  return fwSlash(path.join(await baseLib.getBinDir(), 'vcpkg'));
}

export async function getDefaultVcpkgInstallDirectory(baseLib: baselib.BaseLib,): Promise<string> {
  return fwSlash(path.join(await baseLib.getBinDir(), 'vcpkg_installed'));
}

export async function getDefaultVcpkgCacheDirectory(baseLib: baselib.BaseLib,): Promise<string> {
  return fwSlash(path.join(await baseLib.getBinDir(), 'vcpkg_cache'));
}

function fwSlash(p: string): string {
  return p.replace(/\\/g, '/');
}