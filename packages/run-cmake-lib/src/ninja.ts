// Copyright (c) 2019-2020 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as path from 'path';
import * as baselib from '@lukka/base-lib';

export class NinjaDownloader {
  private static readonly baseUrl =
    'https://github.com/ninja-build/ninja/releases/download/v1.10.0';

  private readonly baseUtils: baselib.BaseLibUtils;

  constructor(private readonly baseLib: baselib.BaseLib) {
    this.baseUtils = new baselib.BaseLibUtils(baseLib);
  }

  async download(url: string): Promise<string> {
    if (!url) {
      if (this.baseUtils.isLinux()) {
        url = `${NinjaDownloader.baseUrl}/ninja-linux.zip`;
      } else if (this.baseUtils.isDarwin()) {
        url = `${NinjaDownloader.baseUrl}/ninja-mac.zip`;
      } else if (this.baseUtils.isWin32()) {
        url = `${NinjaDownloader.baseUrl}/ninja-win.zip`;
      }
    }

    // Create the name of the executable, i.e. ninja or ninja.exe .
    let ninjaExeName = 'ninja';
    if (this.baseUtils.isWin32()) {
      ninjaExeName += ".exe";
    }

    const ninjaPath = await this.baseUtils.downloadArchive(url);
    const ninjaFullPath = path.join(ninjaPath, ninjaExeName);
    if (this.baseUtils.isLinux() || this.baseUtils.isDarwin()) {
      await this.baseLib.exec('chmod', ['+x', ninjaFullPath]);
    }

    return ninjaFullPath;
  }

  private async findNinjaTool(): Promise<string> {
    const ninjaPath = await this.baseLib.which('ninja', false);
    return ninjaPath;
  };



  public async retrieveNinjaPath(ninjaPath: string | undefined, ninjaDownloadUrl: string): Promise<string> {
    if (!ninjaPath) {
      this.baseLib.debug("Path to ninja executable has not been explicitly specified on the task. Searching for it now...");

      ninjaPath = await this.findNinjaTool();
      if (!ninjaPath) {
        this.baseLib.debug("Cannot find Ninja in PATH environment variable.");
        ninjaPath =
          await this.download(ninjaDownloadUrl);
        if (!ninjaPath) {
          throw new Error("Cannot find nor download Ninja.");
        }
      }
    }

    this.baseLib.debug(`Returning ninja at: ${ninjaPath}`);
    return ninjaPath;
  }
}