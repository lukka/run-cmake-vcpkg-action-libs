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
  CMakeListsTxtBasic = 1,
  CMakeListsTxtAdvanced,
  CMakeSettingsJson
}

function getTargetType(typeString: string): TaskModeType | undefined {
  return TaskModeType[typeString as keyof typeof TaskModeType];
}

const CMakeGenerator: any = {
  'Unknown': {},
  'VS16Arm': { 'G': 'Visual Studio 16 2019', 'A': 'ARM', 'MultiConfiguration': true },
  'VS16Win32': { 'G': 'Visual Studio 16 2019', 'A': 'Win32', 'MultiConfiguration': true },
  'VS16Win64': { 'G': 'Visual Studio 16 2019', 'A': 'x64', 'MultiConfiguration': true },
  'VS16Arm64': { 'G': 'Visual Studio 16 2019', 'A': 'ARM64', 'MultiConfiguration': true },
  'VS15Arm': { 'G': 'Visual Studio 15 2017', 'A': 'ARM', 'MultiConfiguration': true },
  'VS15Win32': { 'G': 'Visual Studio 15 2017', 'A': 'Win32', 'MultiConfiguration': true },
  'VS15Win64': { 'G': 'Visual Studio 15 2017', 'A': 'x64', 'MultiConfiguration': true },
  'VS15Arm64': { 'G': 'Visual Studio 15 2017', 'A': 'ARM64', 'MultiConfiguration': true },
  'Ninja': { 'G': 'Ninja', 'A': '', 'MultiConfiguration': false },
  'UnixMakefiles': { 'G': 'Unix Makefiles', 'A': '', 'MultiConfiguration': false }
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
  readonly taskMode: TaskModeType;
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

  private static readonly modePerInput: { [inputName: string]: TaskModeType[] } = {
    [globals.cmakeListsTxtPath]:
      [TaskModeType.CMakeListsTxtBasic, TaskModeType.CMakeListsTxtAdvanced],
    [globals.cmakeSettingsJsonPath]:
      [TaskModeType.CMakeSettingsJson],
    [globals.cmakeToolchainPath]:
      [TaskModeType.CMakeListsTxtBasic],
    /*[globals.useVcpkgToolchainFile]: all */
    /*[globals.vcpkgTriplet]: all */
    [globals.cmakeBuildType]:
      [TaskModeType.CMakeListsTxtBasic],
    [globals.cmakeGenerator]:
      [TaskModeType.CMakeListsTxtBasic],
    /*[globals.buildDirectory]: all */
    [globals.cmakeAppendedArgs]:
      [TaskModeType.CMakeListsTxtAdvanced, TaskModeType.CMakeSettingsJson],
    [globals.configurationRegexFilter]:
      [TaskModeType.CMakeSettingsJson],
    [globals.buildWithCMakeArgs]:
      [TaskModeType.CMakeListsTxtAdvanced, TaskModeType.CMakeListsTxtBasic]
  };

  private static warnIfUnused(inputName: string, taskMode: TaskModeType): void {
    if (inputName in CMakeRunner.modePerInput) {
      const usedInMode: TaskModeType[] = CMakeRunner.modePerInput[name];
      if (usedInMode) {
        if (usedInMode.indexOf(taskMode) < 0) { }

        // Unfortunately there is not a way to discriminate between a value provided by the user
        // from a default value (not provided by the user), hence it is not possible to identify
        // what the user provided.
        //??this.tl.warning(`The input '${inputName}' is ignored in mode '${taskMode}'`);
      }
    }
  }

  public constructor(private tl: ifacelib.BaseLib) {
    const mode: string = this.tl.getInput(globals.cmakeListsOrSettingsJson, true) ?? "";
    const taskMode: TaskModeType | undefined = getTargetType(mode);
    if (!taskMode) {
      throw new Error(`ctor(): invalid task mode '${mode}'.`);
    }
    this.taskMode = taskMode;

    this.cmakeSettingsJsonPath = this.tl.getPathInput(
      globals.cmakeSettingsJsonPath,
      this.taskMode === TaskModeType.CMakeSettingsJson) ?? "";

    this.cmakeListsTxtPath = this.tl.getPathInput(
      globals.cmakeListsTxtPath,
      this.taskMode === TaskModeType.CMakeListsTxtBasic) ?? "";

    this.buildDir = this.tl.getInput(
      globals.buildDirectory,
      this.taskMode === TaskModeType.CMakeListsTxtBasic) ?? "";
    this.appendedArgs = this.tl.getInput(
      globals.cmakeAppendedArgs,
      false) ?? "";
    this.configurationFilter = this.tl.getInput(
      globals.configurationRegexFilter,
      this.taskMode === TaskModeType.CMakeSettingsJson) ?? "";
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
      this.taskMode === TaskModeType.CMakeListsTxtBasic) ?? "";
    this.generator = getGenerator(gen);
    this.ninjaDownloadUrl = this.tl.getInput(globals.ninjaDownloadUrl, false) ?? "";
    this.doBuild = this.tl.getBoolInput(globals.buildWithCMake, false) ?? false;
    this.doBuildArgs = this.tl.getInput(globals.buildWithCMakeArgs, false) ?? "";
    this.cmakeSourceDir = path.dirname(this.cmakeListsTxtPath ?? "");

    this.useVcpkgToolchainFile =
      this.tl.getBoolInput(globals.useVcpkgToolchainFile, false) ?? false;

    this.cmakeBuildType = this.tl.getInput(
      globals.cmakeBuildType,
      this.taskMode === TaskModeType.CMakeListsTxtBasic) ?? "";

    this.vcpkgTriplet = this.tl.getInput(globals.vcpkgTriplet, false) ?? "";

    this.sourceScript = this.tl.getInput(globals.cmakeWrapperCommand, false) ?? "";
  }

  async run(): Promise<void> {
    this.tl.debug('run()<<');

    await this.configure();
  }

  async configure(): Promise<void> {
    this.tl.debug('configure()<<');

    // Contains the '--config <CONFIG>' when using multiconfiguration generators.
    let prependedBuildArguments = "";
    let cmakeArgs = ' ';

    switch (this.taskMode) {
      case TaskModeType.CMakeListsTxtAdvanced:
      case TaskModeType.CMakeListsTxtBasic: {
        // Search for CMake tool and run it
        let cmake: ifacelib.ToolRunner;
        if (this.sourceScript) {
          cmake = this.tl.tool(this.sourceScript);
          cmakeArgs += await this.tl.which('cmake', true) + " ";
        } else {
          cmake = this.tl.tool(await this.tl.which('cmake', true));
        }

        if (this.taskMode == TaskModeType.CMakeListsTxtAdvanced) {
          cmakeArgs += this.appendedArgs ?? "";

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
          const generatorIsMultiConf = this.generator['MultiConfiguration'] ?? false;
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

          // Add CMake's build type, unless a multi configuration generator is being used.
          if (!generatorIsMultiConf) {
            cmakeArgs += ` -DCMAKE_BUILD_TYPE=${this.cmakeBuildType}`;
          }

          prependedBuildArguments = this.prependBuildConfigIfNeeded(this.doBuildArgs, generatorIsMultiConf, this.cmakeBuildType);
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
          await CMakeRunner.build(this.tl, this.buildDir, prependedBuildArguments + this.doBuildArgs, options);
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

  /// If not already provided, creates the '--config <CONFIG>' argument to pass when building.
  /// Return a string of arguments to prepend the build arguments.
  private prependBuildConfigIfNeeded(buildArgs: string, multiConfi: boolean, buildType: string): string {
    let prependArgs = "";
    if (multiConfi && buildArgs.includes("--config")) {
      prependArgs = ` --config ${buildType} ${buildArgs}`;
    }

    return prependArgs;
  }

  /**
 * Build with CMake.
 * @export
 * @param {string} buildDir
 * @param {string} buildArgs
 * @param {trm.IExecOptions} options
 * @param {string} sourceScript
 * @returns {Promise<void>}
 */
  static async build(baseLib: ifacelib.BaseLib, buildDir: string, buildArgs: string, options: ifacelib.ExecOptions): Promise<void> {
    // Run CMake with the given arguments
    const cmake: ifacelib.ToolRunner = baseLib.tool(await baseLib.which('cmake', true));
    cmake.line("--build . " + buildArgs ?? "");

    // Run the command in the build directory
    options.cwd = buildDir;
    console.log(`Building with CMake in build directory '${options.cwd}' ...`);
    const code = await cmake.exec(options);
    if (code != 0) {
      throw new Error(`"Build failed with error code: '${code}'."`);
    }
  }

}
