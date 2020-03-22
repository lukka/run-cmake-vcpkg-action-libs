// Copyright (c) 2019-2020 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as path from 'path';
import * as ifacelib from '../../base-lib/src/base-lib'
import * as utils from './utils';

export async function findNinjaTool(): Promise<string> {
  const ninjaPath = await utils.getBaseLib().which('ninja', false);
  return ninjaPath;
};

export class NinjaDownloader {
  static baseUrl =
    'https://github.com/ninja-build/ninja/releases/download/v1.9.0';

  static async download(url: string): Promise<string> {
    let ninjaPath = '';

    if (!url) {
      if (utils.isLinux()) {
        url = `${NinjaDownloader.baseUrl}/ninja-linux.zip`;
      } else if (utils.isDarwin()) {
        url = `${NinjaDownloader.baseUrl}/ninja-mac.zip`;
      } else if (utils.isWin32()) {
        url = `${NinjaDownloader.baseUrl}/ninja-win.zip`;
      }
    }

    // Create the name of the executable, i.e. ninja or ninja.exe .
    let ninjaExeName = 'ninja';
    if (utils.isWin32()) {
      ninjaExeName += ".exe";
    }

    ninjaPath = await utils.Downloader.downloadArchive(url);
    ninjaPath = path.join(ninjaPath, ninjaExeName);
    if (utils.isLinux() || utils.isDarwin()) {
      await utils.getBaseLib().exec('chmod', ['+x', ninjaPath]);
    }

    return `"${ninjaPath}"`;
  }
}

export async function retrieveNinjaPath(ninjaPath: string | undefined, ninjaDownloadUrl: string): Promise<string> {
  const baseLib: ifacelib.BaseLib = utils.getBaseLib();
  if (!ninjaPath) {
    baseLib.debug("Path to ninja executable has not been explicitly specified on the task. Searching for it now...");

    ninjaPath = await findNinjaTool();
    if (!ninjaPath) {
      baseLib.debug("Cannot find Ninja in PATH environment variable.");
      ninjaPath =
        await NinjaDownloader.download(ninjaDownloadUrl);
      if (!ninjaPath) {
        throw new Error("Cannot find nor download Ninja.");
      }
    }
  }
  baseLib.debug(`Returning ninja at: ${ninjaPath}`);
  return ninjaPath;
}

