// Copyright (c) 2019-2020 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as ifacelib from './base-lib';
import * as path from 'path';
import { CMakeSettingsJsonRunner } from './cmakesettings-runner'
import * as globals from './cmake-globals';
import * as ninjalib from './ninja';
import * as utils from './utils'

enum TaskModeType {
  Unknown = 0,
  CMakeListsTxtBasic,
  CMakeListsTxtAdvanced,
  CMakeSettingsJson
}

function getTargetType(typeString: string): TaskModeType {
  let type: TaskModeType = TaskModeType.Unknown;
  switch (typeString) {
    case 'CMakeListsTxtBasic': {
      type = TaskModeType.CMakeListsTxtBasic;
      break;
    }
    case 'CMakeListsTxtAdvanced': {
      type = TaskModeType.CMakeListsTxtAdvanced;
      break;
    }
    case 'CMakeSettingsJson': {
      type = TaskModeType.CMakeSettingsJson;
      break;
    }
  }
  return type;
}

const CMakeGenerator: any = {
  'Unknown': {},
  'VS16Arm': { 'G': 'Visual Studio 16 2019', 'A': 'ARM' },
  'VS16Win32': { 'G': 'Visual Studio 16 2019', 'A': 'Win32' },
  'VS16Win64': { 'G': 'Visual Studio 16 2019', 'A': 'x64' },
  'VS16Arm64': { 'G': 'Visual Studio 16 2019', 'A': 'ARM64' },
  'VS15Arm': { 'G': 'Visual Studio 15 2017', 'A': 'ARM' },
  'VS15Win32': { 'G': 'Visual Studio 15 2017', 'A': 'Win32' },
  'VS15Win64': { 'G': 'Visual Studio 15 2017', 'A': 'x64' },
  'VS15Arm64': { 'G': 'Visual Studio 15 2017', 'A': 'ARM64' },
  'Ninja': { 'G': 'Ninja', 'A': '' },
  'UnixMakefiles': { 'G': 'Unix Makefiles', 'A': '' }
};
function getGenerator(generatorString: string): any {
  const generatorName = CMakeGenerator[generatorString];
  return generatorName;
}

export class CMakeRunner {
  readonly buildDir: string = "";
  readonly appendedArgs: string;
  readonly configurationFilter: string;
  readonly ninjaPath: string;
  readonly ninjaDownloadUrl: string;
  readonly taskMode: TaskModeType = TaskModeType.Unknown;
  readonly cmakeSettingsJsonPath: string;
  readonly cmakeListsTxtPath: string;
  readonly generator: any = {};
  readonly cmakeToolchainPath: string;
  readonly doBuild: boolean;
  readonly doBuildArgs: string;
  readonly cmakeSourceDir: string;
  readonly useVcpkgToolchainFile: boolean;
  readonly cmakeBuildType: string;
  readonly vcpkgTriplet: string;
  readonly sourceScript: string;

  public constructor(private tl: ifacelib.BaseLib) {
    //fetchInput
    this.tl.debug('fetchInput()<<');
    const mode: string = this.tl.getInput(globals.cmakeListsOrSettingsJson, true) ?? "";
    this.taskMode = getTargetType(mode);
    if (this.taskMode == TaskModeType.Unknown || !this.taskMode) {
      throw new Error(`fetchInput(): invalid task mode '${this.taskMode}'.`);
    }

    this.cmakeSettingsJsonPath = this.tl.getPathInput(
      globals.cmakeSettingsJsonPath,
      this.taskMode == TaskModeType.CMakeSettingsJson) ?? "";
    this.cmakeListsTxtPath = this.tl.getPathInput(
      globals.cmakeListsTxtPath,
      this.taskMode == TaskModeType.CMakeListsTxtBasic) ?? "";

    this.buildDir = this.tl.getInput(
      globals.buildDirectory,
      this.taskMode == TaskModeType.CMakeListsTxtBasic) ?? "";
    this.appendedArgs = this.tl.getInput(
      globals.cmakeAppendedArgs,
      false) ?? "";
    this.configurationFilter = this.tl.getInput(
      globals.configurationRegexFilter,
      this.taskMode == TaskModeType.CMakeSettingsJson) ?? "";
    this.ninjaPath = '';
    if (this.tl.isFilePathSupplied(globals.ninjaPath)) {
      this.ninjaPath = tl.getInput(globals.ninjaPath, false) ?? "";
    }

    this.cmakeToolchainPath = "";
    if (this.tl.isFilePathSupplied(globals.cmakeToolchainPath)) {
      this.cmakeToolchainPath = tl.getInput(globals.cmakeToolchainPath, false) ?? "";
    }
    const gen: string = this.tl.getInput(
      globals.cmakeGenerator,
      this.taskMode == TaskModeType.CMakeListsTxtBasic) ?? "";
    this.generator = getGenerator(gen);
    this.ninjaDownloadUrl = this.tl.getInput(globals.ninjaDownloadUrl, false) ?? "";
    this.doBuild = this.tl.getBoolInput(globals.buildWithCMake, false) ?? false;
    this.doBuildArgs = this.tl.getInput(globals.buildWithCMakeArgs, false) ?? "";
    this.cmakeSourceDir = path.dirname(this.cmakeListsTxtPath ?? "");

    this.useVcpkgToolchainFile =
      this.tl.getBoolInput(globals.useVcpkgToolchainFile, false) ?? false;

    this.cmakeBuildType = this.tl.getInput(
      globals.cmakeBuildType,
      this.taskMode == TaskModeType.CMakeListsTxtBasic) ?? "";

    this.vcpkgTriplet = this.tl.getInput(globals.vcpkgTriplet, false) ?? "";

    this.sourceScript = this.tl.getInput(globals.cmakeWrapperCommand, false) ?? "";
  }

  async run(): Promise<void> {
    this.tl.debug('run()<<');

    await this.configure();
  }

  async configure(): Promise<void> {
    this.tl.debug('configure()<<')
    let cmakeArgs = ' ';

    switch (this.taskMode) {
      default:
      case TaskModeType.Unknown: {
        throw new Error(`Invalid task mode: '${this.taskMode}'.`);
      }

      case TaskModeType.CMakeListsTxtAdvanced:
      case TaskModeType.CMakeListsTxtBasic: {
        // Search for CMake tool and run it
        let cmake: ifacelib.ToolRunner;
        if (this.sourceScript) {
          cmake = this.tl.tool(this.sourceScript);
          cmakeArgs += await this.tl.which('cmake', true);
        } else {
          cmake = this.tl.tool(await this.tl.which('cmake', true));
        }

        if (this.taskMode == TaskModeType.CMakeListsTxtAdvanced) {
          cmakeArgs = this.appendedArgs ?? "";

          // If Ninja is required, specify the path to it.
          if (utils.isNinjaGenerator(cmakeArgs)) {
            if (!utils.isMakeProgram(cmakeArgs)) {
              const ninjaPath: string = await ninjalib.retrieveNinjaPath(this.ninjaPath, this.ninjaDownloadUrl);
              cmakeArgs += ` -DCMAKE_MAKE_PROGRAM="${ninjaPath}"`;
            }
          }
        } else if (this.taskMode == TaskModeType.CMakeListsTxtBasic) {
          const generatorName = this.generator['G'];
          const generatorArch = this.generator['A'];
          cmakeArgs = ` -G "${generatorName}"`;
          if (generatorArch) {
            cmakeArgs += ` -A ${generatorArch}`;
          }
          if (generatorName == CMakeGenerator['Ninja']['G']) {
            const ninjaPath: string = await ninjalib.retrieveNinjaPath(this.ninjaPath, this.ninjaDownloadUrl);
            cmakeArgs += ` -DCMAKE_MAKE_PROGRAM="${ninjaPath}"`;
          }

          if (this.cmakeToolchainPath) {
            cmakeArgs += ` -D${utils.CMAKE_TOOLCHAIN_FILE}="${this.cmakeToolchainPath}"`;
          }

          // Add build type.
          cmakeArgs += ` -DCMAKE_BUILD_TYPE=${this.cmakeBuildType}`;
        }

        // Use vcpkg toolchain if requested.
        if (this.useVcpkgToolchainFile === true) {
          cmakeArgs = await utils.injectVcpkgToolchain(cmakeArgs, this.vcpkgTriplet)
        }

        // The source directory is required for any mode.
        cmakeArgs += ` ${this.cmakeSourceDir}`;

        this.tl.debug(`CMake arguments: ${cmakeArgs}`);

        // Ensure the build directory is existing.
        await this.tl.mkdirP(this.buildDir);

        cmake.line(cmakeArgs);

        const options = {
          cwd: this.buildDir,
          failOnStdErr: false,
          errStream: process.stdout,
          outStream: process.stdout,
          ignoreReturnCode: true,
          silent: false,
          windowsVerbatimArguments: false,
          env: process.env
        } as ifacelib.ExecOptions;

        this.tl.debug(`Generating project files with CMake in build directory '${options.cwd}' ...`);
        const code: number = await cmake.exec(options);
        if (code != 0) {
          throw new Error(`"CMake failed with error: '${code}'.`);
        }

        if (this.doBuild) {
          await utils.build(this.buildDir, this.doBuildArgs, options);
        }

        break;
      }

      case TaskModeType.CMakeSettingsJson: {
        const cmakeJson: CMakeSettingsJsonRunner = new CMakeSettingsJsonRunner(
          this.cmakeSettingsJsonPath,
          this.configurationFilter,
          this.appendedArgs,
          this.tl.getSrcDir(),
          this.vcpkgTriplet,
          this.useVcpkgToolchainFile,
          this.doBuild,
          this.ninjaPath,
          this.ninjaDownloadUrl,
          this.sourceScript,
          this.buildDir,
          this.tl);
        await cmakeJson.run();
        break;
      }
    }
  }
}
