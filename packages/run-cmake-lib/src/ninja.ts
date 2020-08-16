// Copyright (c) 2019-2020 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as path from 'path';
import * as baselib from '@lukka/base-lib';

export class NinjaProvider {
  private static readonly baseUrl =
    'https://github.com/ninja-build/ninja/releases/download/v1.10.0';

  private readonly baseUtils: baselib.BaseLibUtils;

  constructor(private readonly baseLib: baselib.BaseLib) {
    this.baseUtils = new baselib.BaseLibUtils(baseLib);
  }

  private async download(url: string): Promise<string> {
    if (!url) {
      if (this.baseUtils.isLinux()) {
        url = `${NinjaProvider.baseUrl}/ninja-linux.zip`;
      } else if (this.baseUtils.isDarwin()) {
        url = `${NinjaProvider.baseUrl}/ninja-mac.zip`;
      } else if (this.baseUtils.isWin32()) {
        url = `${NinjaProvider.baseUrl}/ninja-win.zip`;
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

  /**
   * Retrieve the path to 'ninja' executable. If the provided path to ninja is no existent
   * it will download the ninja archive from the provided one, if the latter not provided from 
   * the default URL for ths host platform.
   * @param {(string | undefined)} ninjaPath Optional path to ninja executable.
   * @param {string} ninjaDownloadUrl Optional URL to download ninja from.
   * @returns {Promise<string>} The full path to the ninja executable.
   * @memberof NinjaDownloader
   */
  public async retrieveNinjaPath(ninjaPath: string, ninjaDownloadUrl: string): Promise<string> {
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