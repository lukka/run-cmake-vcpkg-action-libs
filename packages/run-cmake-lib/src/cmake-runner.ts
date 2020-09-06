// Copyright (c) 2019-2020 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as baselib from '@lukka/base-lib';
import * as baseutillib from '@lukka/base-util-lib';
import * as path from 'path';
import { CMakeSettingsJsonRunner } from './cmakesettings-runner'
import * as cmakeglobals from './cmake-globals';
import * as ninjalib from './ninja';
import { using } from "using-statement";
import * as cmakelib from './utils'

enum RunCMakeModeType {
  CMakeListsTxtBasic = 1,
  CMakeListsTxtAdvanced,
  CMakeSettingsJson
}

function getTargetType(typeString: string): RunCMakeModeType | undefined {
  return RunCMakeModeType[typeString as keyof typeof RunCMakeModeType];
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
  'NinjaMulti': { 'G': 'Ninja Multi-Config', 'A': '', 'MultiConfiguration': true },
  'UnixMakefiles': { 'G': 'Unix Makefiles', 'A': '', 'MultiConfiguration': false }
};
function getGenerator(generatorString: string): any {
  const generatorName = CMakeGenerator[generatorString];
  return generatorName;
}

export class CMakeRunner {
  private readonly ninjaLib: ninjalib.NinjaProvider;
  private readonly baseUtils: baseutillib.BaseLibUtils;
  private readonly cmakeUtils: cmakelib.CMakeUtils;
  private readonly buildDir: string = "";
  private readonly appendedArgs: string;
  private readonly configurationFilter: string;
  private readonly ninjaPath: string;
  private readonly ninjaDownloadUrl: string;
  private readonly runMode: RunCMakeModeType;
  private readonly cmakeSettingsJsonPath: string;
  private readonly cmakeListsTxtPath: string;
  private readonly generator: any = {};
  private readonly cmakeToolchainPath: string;
  private readonly doBuild: boolean;
  private readonly doBuildArgs: string;
  private readonly cmakeSourceDir: string;
  private readonly useVcpkgToolchainFile: boolean;
  private readonly cmakeBuildType: string;
  private readonly vcpkgTriplet: string;
  private readonly sourceScript: string;

  private static readonly modePerInput: { [inputName: string]: RunCMakeModeType[] } = {
    [cmakeglobals.cmakeListsTxtPath]:
      [RunCMakeModeType.CMakeListsTxtBasic, RunCMakeModeType.CMakeListsTxtAdvanced],
    [cmakeglobals.cmakeSettingsJsonPath]:
      [RunCMakeModeType.CMakeSettingsJson],
    [cmakeglobals.cmakeToolchainPath]:
      [RunCMakeModeType.CMakeListsTxtBasic],
    /*[globals.useVcpkgToolchainFile]: all */
    /*[globals.vcpkgTriplet]: all */
    [cmakeglobals.cmakeBuildType]:
      [RunCMakeModeType.CMakeListsTxtBasic],
    [cmakeglobals.cmakeGenerator]:
      [RunCMakeModeType.CMakeListsTxtBasic],
    /*[globals.buildDirectory]: all */
    [cmakeglobals.cmakeAppendedArgs]:
      [RunCMakeModeType.CMakeListsTxtAdvanced, RunCMakeModeType.CMakeSettingsJson],
    [cmakeglobals.configurationRegexFilter]:
      [RunCMakeModeType.CMakeSettingsJson],
    [cmakeglobals.buildWithCMakeArgs]:
      [RunCMakeModeType.CMakeListsTxtAdvanced, RunCMakeModeType.CMakeListsTxtBasic]
  };

  /*
    // Unfortunately there is not a way to discriminate between a value provided by the user
    // from a default value (not provided by the user), hence it is not possible to identify
    // what the user provided.  
    private static warnIfUnused(inputName: string, taskMode: TaskModeType): void {
      if (inputName in CMakeRunner.modePerInput) {
        const usedInMode: TaskModeType[] = CMakeRunner.modePerInput[name];
        if (usedInMode) {
          if (usedInMode.indexOf(taskMode) < 0) { }
  
          //??this.tl.warning(`The input '${inputName}' is ignored in mode '${taskMode}'`);
        }
      }
    }
  */

  public constructor(private tl: baselib.BaseLib) {
    this.baseUtils = new baseutillib.BaseLibUtils(this.tl);
    this.cmakeUtils = new cmakelib.CMakeUtils(this.baseUtils);
    this.ninjaLib = new ninjalib.NinjaProvider(this.tl);

    const mode: string = this.tl.getInput(cmakeglobals.cmakeListsOrSettingsJson, true) ?? "";
    const runMode: RunCMakeModeType | undefined = getTargetType(mode);
    if (!runMode) {
      throw new Error(`ctor(): invalid mode '${mode}'.`);
    }
    this.runMode = runMode;

    let required = this.runMode === RunCMakeModeType.CMakeSettingsJson;
    this.cmakeSettingsJsonPath = this.tl.getPathInput(
      cmakeglobals.cmakeSettingsJsonPath,
      required,
      required) ?? "";

    required = this.runMode !== RunCMakeModeType.CMakeSettingsJson;
    this.cmakeListsTxtPath = this.tl.getPathInput(
      cmakeglobals.cmakeListsTxtPath,
      required,
      required) ?? "";

    this.buildDir = this.tl.getInput(
      cmakeglobals.buildDirectory,
      this.runMode === RunCMakeModeType.CMakeListsTxtBasic) ?? "";
    this.appendedArgs = this.tl.getInput(
      cmakeglobals.cmakeAppendedArgs,
      false) ?? "";
    this.configurationFilter = this.tl.getInput(
      cmakeglobals.configurationRegexFilter,
      false) ?? "";
    this.ninjaPath = '';
    if (this.tl.isFilePathSupplied(cmakeglobals.ninjaPath)) {
      this.ninjaPath = tl.getInput(cmakeglobals.ninjaPath, false) ?? "";
    }

    this.cmakeToolchainPath = "";
    if (this.tl.isFilePathSupplied(cmakeglobals.cmakeToolchainPath)) {
      this.cmakeToolchainPath = tl.getInput(cmakeglobals.cmakeToolchainPath, false) ?? "";
    }
    const gen: string = this.tl.getInput(
      cmakeglobals.cmakeGenerator,
      this.runMode === RunCMakeModeType.CMakeListsTxtBasic) ?? "";
    this.generator = getGenerator(gen);
    this.ninjaDownloadUrl = this.tl.getInput(cmakeglobals.ninjaDownloadUrl, false) ?? "";
    this.doBuild = this.tl.getBoolInput(cmakeglobals.buildWithCMake, false) ?? false;
    this.doBuildArgs = this.tl.getInput(cmakeglobals.buildWithCMakeArgs, false) ?? "";
    this.cmakeSourceDir = path.dirname(baseutillib.BaseLibUtils.normalizePath(this.cmakeListsTxtPath) ?? "");

    this.useVcpkgToolchainFile =
      this.tl.getBoolInput(cmakeglobals.useVcpkgToolchainFile, false) ?? false;

    this.cmakeBuildType = this.tl.getInput(
      cmakeglobals.cmakeBuildType,
      this.runMode === RunCMakeModeType.CMakeListsTxtBasic) ?? "";

    this.vcpkgTriplet = (this.tl.getInput(cmakeglobals.cmakeVcpkgTriplet, false) ||
      process.env.RUNVCPKG_VCPKG_TRIPLET) ?? "";

    this.sourceScript = this.tl.getInput(cmakeglobals.cmakeWrapperCommand, false) ?? "";
  }

  async run(): Promise<void> {
    this.tl.debug('run()<<');
    await this.configure();
    this.tl.debug('run()>>');
  }

  private async configure(): Promise<void> {
    this.tl.debug('configure()<<');

    // Contains the '--config <CONFIG>' when using multiconfiguration generators.
    let prependedBuildArguments = "";
    let cmakeArgs: string[] = [];

    switch (this.runMode) {
      case RunCMakeModeType.CMakeListsTxtAdvanced:
      case RunCMakeModeType.CMakeListsTxtBasic: {
        // Search for CMake tool and run it.
        let cmake: baselib.ToolRunner;
        if (this.sourceScript) {
          cmake = this.tl.tool(this.sourceScript);
          cmakeArgs.push(await this.tl.which('cmake', true));
        } else {
          cmake = this.tl.tool(await this.tl.which('cmake', true));
        }

        if (this.runMode === RunCMakeModeType.CMakeListsTxtAdvanced) {

          // If Ninja is required, specify the path to it.
          if (this.baseUtils.isNinjaGenerator([this.appendedArgs])) {
            if (!this.baseUtils.isMakeProgram([this.appendedArgs])) {
              const ninjaPath: string = await this.ninjaLib.retrieveNinjaPath(this.ninjaPath, this.ninjaDownloadUrl);
              cmakeArgs.push(`-DCMAKE_MAKE_PROGRAM=${ninjaPath}`);
            }
          }

          if (this.appendedArgs) {
            this.tl.debug(`Parsing additional CMake args: ${this.appendedArgs}`);
            const addedArgs: string[] = cmake._argStringToArray(this.appendedArgs);
            this.tl.debug(`Appending args: ${JSON.stringify(addedArgs)}`);
            cmakeArgs = [...cmakeArgs, ...addedArgs];
          }

        } else if (this.runMode === RunCMakeModeType.CMakeListsTxtBasic) {
          const generatorName = this.generator['G'];
          const generatorArch = this.generator['A'];
          const generatorIsMultiConf = this.generator['MultiConfiguration'] ?? false;
          cmakeArgs.push(`-G${generatorName}`);
          if (generatorArch) {
            cmakeArgs.push(`-A${generatorArch}`);
          }
          if (CMakeRunner.isNinjaGenerator(generatorName)) {
            const ninjaPath: string = await this.ninjaLib.retrieveNinjaPath(this.ninjaPath, this.ninjaDownloadUrl);
            cmakeArgs.push(`-DCMAKE_MAKE_PROGRAM=${ninjaPath}`);
          }

          if (this.cmakeToolchainPath) {
            cmakeArgs.push(`-DCMAKE_TOOLCHAIN_FILE=${this.cmakeToolchainPath}`);
          }

          // Add CMake's build type, unless a multi configuration generator is being used.
          if (!generatorIsMultiConf) {
            cmakeArgs.push(`-DCMAKE_BUILD_TYPE=${this.cmakeBuildType}`);
          }

          prependedBuildArguments = this.prependBuildConfigIfNeeded(this.doBuildArgs,
            generatorIsMultiConf, this.cmakeBuildType);
        }

        // Use vcpkg toolchain if requested.
        if (this.useVcpkgToolchainFile === true) {
          cmakeArgs = await this.cmakeUtils.injectVcpkgToolchain(cmakeArgs, this.vcpkgTriplet, this.tl)
        }

        // The source directory is required for any mode.
        cmakeArgs.push(this.cmakeSourceDir);

        this.tl.debug(`CMake arguments: ${cmakeArgs}`);

        for (const arg of cmakeArgs) {
          cmake.arg(arg);
        }

        // Ensure the build directory is existing.
        await this.tl.mkdirP(this.buildDir);

        const options = {
          cwd: this.buildDir,
          failOnStdErr: false,
          errStream: process.stdout,
          outStream: process.stdout,
          ignoreReturnCode: true,
          silent: false,
          windowsVerbatimArguments: false,
          env: process.env
        } as baselib.ExecOptions;

        this.tl.debug(`Generating project files with CMake in build directory '${options.cwd}' ...`);
        let code = -1;
        await using(baseutillib.Matcher.createMatcher('cmake', this.tl, this.cmakeSourceDir), async matcher => {
          code = await this.baseUtils.wrapOp("Generate project files with CMake", async () => await cmake.exec(options));
        });

        if (code !== 0) {
          throw new Error(`"CMake failed with error code: '${code}'.`);
        }

        if (this.doBuild) {
          await using(baseutillib.Matcher.createMatcher(CMakeRunner.getBuildMatcher(
            this.buildDir, this.tl), this.tl), async matcher => {
              await this.baseUtils.wrapOp("Build with CMake", async () =>
                await CMakeRunner.build(this.tl, this.buildDir, prependedBuildArguments +   this.doBuildArgs, options))
            });
        }

        break;
      }

      case RunCMakeModeType.CMakeSettingsJson: {
        const cmakeJson: CMakeSettingsJsonRunner = new CMakeSettingsJsonRunner(
          this.tl,
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
          this.buildDir);
        await this.baseUtils.wrapOp("Run CMake with CMakeSettings.json", async () => await cmakeJson.run());
        break;
      }
    }
  }

  private static isNinjaGenerator(generatorName: string): boolean {
    return generatorName === CMakeGenerator['Ninja']['G'] ||
      generatorName === CMakeGenerator['NinjaMulti']['G'];
  }

  /// If not already provided, creates the '--config <CONFIG>' argument to pass when building.
  /// Return a string of arguments to prepend the build arguments.
  private prependBuildConfigIfNeeded(buildArgs: string, multiConfi: boolean, buildType: string): string {
    let prependArgs = "";
    if (multiConfi && !buildArgs.includes("--config")) {
      prependArgs = ` --config ${buildType} `;
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
  static async build(baseLib: baselib.BaseLib, buildDir: string, buildArgs: string, options: baselib.ExecOptions): Promise<void> {
    // Run CMake with the given arguments
    const cmake: baselib.ToolRunner = baseLib.tool(await baseLib.which('cmake', true));
    cmake.arg("--build");
    cmake.arg(".");
    if (buildArgs)
      cmake.line(buildArgs);

    // Run the command in the build directory
    options.cwd = buildDir;
    console.log(`Building with CMake in build directory '${options.cwd}' ...`);
    const code = await cmake.exec(options);
    if (code !== 0) {
      throw new Error(`"Build failed with error code: '${code}'."`);
    }
  }

  private static gccMatcher = 'gcc';
  private static clangMatcher = 'clang';
  private static msvcMatcher = 'msvc';

  private static getDefaultMatcher(): string {
    const plat = process.platform;
    return plat === "win32" ? CMakeRunner.msvcMatcher :
      plat === "darwin" ? CMakeRunner.clangMatcher : CMakeRunner.gccMatcher;
  }

  private static getCompilerMatcher(line: string): string | undefined {
    let matcherName: string | undefined = undefined;
    if (line.includes('g++') || line.includes('gcc') || line.includes('c++'))
      matcherName = CMakeRunner.gccMatcher;
    else if (line.includes('cl.exe'))
      matcherName = CMakeRunner.msvcMatcher;
    else if (line.includes('clang'))
      matcherName = CMakeRunner.clangMatcher;
    return matcherName;
  }

  public static getBuildMatcher(buildDir: string, tl: baselib.BaseLib): string {
    let cxxMatcher: string | undefined;
    let ccMatcher: string | undefined;
    const utils: baseutillib.BaseLibUtils = new baseutillib.BaseLibUtils(tl);
    try {
      const cmakeCacheTxtPath = path.join(buildDir, "CMakeCache.txt");
      const [ok, cacheContent] = utils.readFile(cmakeCacheTxtPath);
      tl.debug(`Loaded fileCMakeCache.txt at path='${cmakeCacheTxtPath}'`);
      if (ok) {
        for (const line of cacheContent.split('\n')) {
          tl.debug(`text=${line}`);
          if (line.includes("CMAKE_CXX_COMPILER:")) {
            tl.debug(`Found CXX compiler: '${line}'.`);
            cxxMatcher = CMakeRunner.getCompilerMatcher(line);
            tl.debug(`Matcher selected for CXX: ${cxxMatcher}`);
            break;
          }
          if (line.includes("CMAKE_C_COMPILER:")) {
            tl.debug(`Found C compiler: '${line}'.`);
            ccMatcher = CMakeRunner.getCompilerMatcher(line);
            tl.debug(`Matcher selected for CC: ${ccMatcher}`);
            break;
          }
        }
      }
    } catch (error) {
      tl.debug(error.toString());
    }

    const defaultMatcher: string = CMakeRunner.getDefaultMatcher();
    tl.debug(`Default matcher according to platform is: ${defaultMatcher}`);

    const selectedMatcher = cxxMatcher ?? ccMatcher ?? defaultMatcher
    tl.debug(`Selected matcher: ${selectedMatcher}`);
    return selectedMatcher;
  }
}
