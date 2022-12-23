// Copyright (c) 2019-2020-2021-2022 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as baselib from '@lukka/base-lib';
import * as baseutillib from '@lukka/base-util-lib';
import * as path from 'path';
import * as cmakeglobals from './cmake-globals';
import { using } from "using-statement";
import * as cmakeutil from './cmake-utils'
import * as runvcpkglib from '@lukka/run-vcpkg-lib'

export class CMakeRunner {
  public static readonly configurePresetDefault = "[`--preset`, `$[env.CONFIGURE_PRESET_NAME]`]";
  public static readonly buildPresetDefault = "[`--build`, `--preset`, `$[env.BUILD_PRESET_NAME]`]";
  public static readonly testPresetDefault = "[`--preset`, `$[env.TEST_PRESET_NAME]`]";
  public static readonly vcpkgEnvDefault = "[`env`, `--bin`, `--include`, `--tools`, `--python`, `--triplet $[env.VCPKG_DEFAULT_TRIPLET]`, `set`]";

  private readonly baseUtils: baseutillib.BaseUtilLib;
  private readonly cmakeListsTxtPath: string;
  private readonly cmakeSourceDir: string;
  private readonly logFilesCollector: baseutillib.LogFileCollector;

  public static async run(baseLib: baselib.BaseLib,
    configurePreset?: string,
    configurePresetCmdStringFormat?: string,
    configurePresetCmdStringAddArgs?: string,
    buildPreset?: string,
    buildPresetCmdStringFormat?: string,
    buildPresetCmdStringAddArgs?: string,
    testPreset?: string,
    testPresetCmdStringFormat?: string,
    testPresetCmdStringAddArgs?: string,
    vcpkgEnvCmdStringFormat?: string): Promise<void> {
    await using(baseutillib.Matcher.createMatcher('all', baseLib, __dirname),
      async () => {
        const cmakeRunner: CMakeRunner = new CMakeRunner(
          baseLib,
          configurePreset,
          configurePresetCmdStringFormat,
          configurePresetCmdStringAddArgs,
          buildPreset,
          buildPresetCmdStringFormat,
          buildPresetCmdStringAddArgs,
          testPreset,
          testPresetCmdStringFormat,
          testPresetCmdStringAddArgs,
          vcpkgEnvCmdStringFormat);
        await cmakeRunner.run();
      });
  }

  public constructor(
    private baseLib: baselib.BaseLib,
    private configurePreset: string | null = null,
    private configurePresetCmdStringFormat: string = CMakeRunner.configurePresetDefault,
    private configurePresetCmdStringAddArgs: string | null = null,
    private buildPreset: string | null = null,
    private buildPresetCmdStringFormat: string = CMakeRunner.buildPresetDefault,
    private buildPresetCmdStringAddArgs: string | null = null,
    private testPreset: string | null = null,
    private testPresetCmdStringFormat: string = CMakeRunner.testPresetDefault,
    private testPresetCmdStringAddArgs: string | null = null,
    private vcpkgEnvStringFormat: string = CMakeRunner.vcpkgEnvDefault) {
    this.baseUtils = new baseutillib.BaseUtilLib(this.baseLib);
    const regs = this.baseLib.getDelimitedInput(cmakeglobals.logCollectionRegExps, ';', false) ?? [];
    this.logFilesCollector = new baseutillib.LogFileCollector(this.baseLib,
      regs, (path: string) => baseutillib.dumpFile(this.baseLib, path));

    this.cmakeListsTxtPath = this.baseLib.getPathInput(
      cmakeglobals.cmakeListsTxtPath,
      true, true) ?? "";


    this.cmakeSourceDir = path.dirname(baseutillib.BaseUtilLib.normalizePath(this.cmakeListsTxtPath) ?? "");
    baseutillib.BaseUtilLib.throwIfNull(this.cmakeSourceDir, cmakeglobals.cmakeListsTxtPath);
  }

  public async run(): Promise<void> {
    this.baseLib.debug('run()<<');
    const cmake: string = await this.baseLib.which('cmake', true);
    this.baseLib.debug(`cmake located at: '${cmake}'.`);
    const ctest: string = await this.baseLib.which('ctest', true);
    this.baseLib.debug(`ctest located at: '${ctest}'.`);

    if (this.configurePreset) {
      const configureTool: baselib.ToolRunner = this.baseLib.tool(cmake);
      await this.configure(configureTool, this.configurePreset);
    }

    if (this.buildPreset) {
      const buildTool: baselib.ToolRunner = this.baseLib.tool(cmake);
      await this.build(buildTool, this.buildPreset);
    }

    if (this.testPreset) {
      const testTool: baselib.ToolRunner = this.baseLib.tool(ctest);
      await this.test(testTool, this.testPreset);
    }

    this.baseLib.debug('run()>>');
  }

  private async test(ctest: baselib.ToolRunner, testPresetName: string): Promise<void> {
    this.baseLib.debug('test()<<');
    baseutillib.setEnvVarIfUndefined("TEST_PRESET_NAME", testPresetName);
    CMakeRunner.addArguments(ctest, this.testPresetCmdStringFormat);
    if (this.testPresetCmdStringAddArgs) {
      CMakeRunner.addArguments(ctest, this.testPresetCmdStringAddArgs);
    }

    this.baseLib.debug(`Testing with CTest ...`);
    await this.baseUtils.wrapOp("Test with CTest",
      async () => await this.launchCMake(
        ctest,
        this.cmakeSourceDir,
        this.logFilesCollector));

    this.baseLib.debug('test()>>');
  }

  private async build(cmake: baselib.ToolRunner, buildPresetName: string): Promise<void> {
    this.baseLib.debug('build()<<');

    baseutillib.setEnvVarIfUndefined("BUILD_PRESET_NAME", buildPresetName);
    CMakeRunner.addArguments(cmake, this.buildPresetCmdStringFormat);
    if (this.buildPresetCmdStringAddArgs) {
      CMakeRunner.addArguments(cmake, this.buildPresetCmdStringAddArgs);
    }

    this.baseLib.debug(`Building with CMake ...`);
    await this.baseUtils.wrapOp("Build with CMake",
      async () => await this.launchCMake(
        cmake,
        this.cmakeSourceDir,
        this.logFilesCollector));

    this.baseLib.debug('build()>>');
  }

  private async configure(cmake: baselib.ToolRunner, configurePresetName: string): Promise<void> {
    this.baseLib.debug('configure()<<');

    baseutillib.setEnvVarIfUndefined("CONFIGURE_PRESET_NAME", configurePresetName);
    const args: string = baseutillib.replaceFromEnvVar(this.configurePresetCmdStringFormat);
    CMakeRunner.addArguments(cmake, this.configurePresetCmdStringFormat);
    if (this.configurePresetCmdStringAddArgs) {
      CMakeRunner.addArguments(cmake, this.configurePresetCmdStringAddArgs);
    }

    await this.baseUtils.wrapOp(`Setup C/C++ toolset environment variables`, async () => {
      const vcpkgRoot: string | undefined = process.env[runvcpkglib.VCPKGROOT];

      // if VCPKG_ROOT is defined, then use it.
      if (!vcpkgRoot || vcpkgRoot.length == 0) {
        this.baseLib.info(`Skipping setting up the environment since VCPKG_ROOT is not defined. It is needed to know where vcpkg executable is located.`);
      } else if (!this.baseUtils.isWin32()) {
        this.baseLib.info(`Skipping setting up the environment since the platform is not Windows.`);
      } else if (process.env.CXX || process.env.CC) {
        // If a C++ compiler is user-enforced, skip setting up the environment for MSVC.
        this.baseLib.info(`Skipping setting up the environment since CXX or CC environment variable are defined. This allows user customization.`);
      } else {
        // If Win32 && (!CC && !CXX), let hardcode CC and CXX so that CMake uses the MSVC toolset.
        process.env['CC'] = "cl.exe";
        process.env['CXX'] = "cl.exe";
        this.baseLib.setVariable("CC", "cl.exe");
        this.baseLib.setVariable("CXX", "cl.exe");

        // Use vcpkg to set the environment using provided command line (which includes the triplet).
        // This is only useful to setup the environment for MSVC on Windows.
        baseutillib.setEnvVarIfUndefined(runvcpkglib.VCPKGDEFAULTTRIPLET, this.baseUtils.getDefaultTriplet());
        const vcpkgEnvArgsString: string = baseutillib.replaceFromEnvVar(this.vcpkgEnvStringFormat);
        const vcpkgEnvArgs: string[] = eval(vcpkgEnvArgsString);
        this.baseLib.debug(`'vcpkg env' arguments: ${vcpkgEnvArgs}`);
        await cmakeutil.injectEnvVariables(this.baseUtils, vcpkgRoot, vcpkgEnvArgs);
      }
    });

    // 
    this.baseLib.debug(`Generating project files with CMake ...`);
    await this.baseUtils.wrapOp("Generate project files with CMake",
      async () => await this.launchCMake(cmake, this.cmakeSourceDir, this.logFilesCollector));

    this.baseLib.debug('configure()>>');
  }

  private async launchCMake(
    cmake: baselib.ToolRunner,
    sourceDir: string, logCollector: baseutillib.LogFileCollector): Promise<void> {
    const options = {
      cwd: sourceDir,
      failOnStdErr: false,
      errStream: process.stdout,
      outStream: process.stdout,
      ignoreReturnCode: true,
      silent: false,
      windowsVerbatimArguments: false,
      env: process.env,
      listeners: {
        stdout: (t: Buffer): void => logCollector.handleOutput(t),
        stderr: (t: Buffer): void => logCollector.handleOutput(t),
      }
    } as baselib.ExecOptions;

    const code = await cmake.exec(options);

    if (code !== 0) {
      throw new Error(`"CMake failed with error code: '${code}'.`);
    }
  }

  private static addArguments(tool: baselib.ToolRunner, args: string) {
    const additionalArgs: string = baseutillib.replaceFromEnvVar(args);
    const arghs: string[] = eval(additionalArgs);
    for (const arg of arghs) {
      tool.arg(arg);
    }
  }
}
