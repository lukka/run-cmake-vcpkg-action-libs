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
  private readonly cmakeConfigurePreset: string | null;
  private readonly cmakeBuildPreset: string | null;
  private readonly cmakeTestPreset: string | null;
  private readonly cmakeSourceDir: string;
  private readonly logFilesCollector: baseutillib.LogFileCollector;

  public static async run(baseLib: baselib.BaseLib,
    configurePresetCmdStringFormat?: string,
    buildPresetCmdStringFormat?: string,
    testPresetCmdStringFormat?: string,
    vcpkgEnvCmdStringFormat?: string): Promise<void> {
    await using(baseutillib.Matcher.createMatcher('all', baseLib, __dirname),
      async () => {
        const cmakeRunner: CMakeRunner = new CMakeRunner(
          baseLib,
          configurePresetCmdStringFormat,
          buildPresetCmdStringFormat,
          testPresetCmdStringFormat,
          vcpkgEnvCmdStringFormat);
        await cmakeRunner.run();
      });
  }

  public constructor(
    private baseLib: baselib.BaseLib,
    private configurePresetCmdStringFormat: string = CMakeRunner.configurePresetDefault,
    private buildPresetCmdStringFormat: string = CMakeRunner.buildPresetDefault,
    private testPresetCmdStringFormat: string = CMakeRunner.testPresetDefault,
    private vcpkgEnvStringFormat: string = CMakeRunner.vcpkgEnvDefault) {
    this.baseUtils = new baseutillib.BaseUtilLib(this.baseLib);
    const regs = this.baseLib.getDelimitedInput(cmakeglobals.logCollectionRegExps, ';', false) ?? [];
    this.logFilesCollector = new baseutillib.LogFileCollector(this.baseLib,
      regs, (path: string) => baseutillib.dumpFile(this.baseLib, path));

    this.cmakeListsTxtPath = this.baseLib.getPathInput(
      cmakeglobals.cmakeListsTxtPath,
      true, true) ?? "";

    this.cmakeConfigurePreset = this.baseLib.getInput(cmakeglobals.configurePreset, true) ?? null;
    this.cmakeBuildPreset = this.baseLib.getInput(cmakeglobals.buildPreset, false) ?? null;
    this.cmakeTestPreset = this.baseLib.getInput(cmakeglobals.testPreset, false) ?? null;

    this.cmakeSourceDir = path.dirname(baseutillib.BaseUtilLib.normalizePath(this.cmakeListsTxtPath) ?? "");
    baseutillib.BaseUtilLib.throwIfNull(this.cmakeSourceDir, cmakeglobals.cmakeListsTxtPath);
  }

  public async run(): Promise<void> {
    this.baseLib.debug('run()<<');
    const cmake: string = await this.baseLib.which('cmake', true);
    const ctest: string = await this.baseLib.which('ctest', true);

    if (this.cmakeConfigurePreset) {
      const configureTool: baselib.ToolRunner = this.baseLib.tool(cmake);
      await this.configure(configureTool, this.cmakeConfigurePreset);
    }

    if (this.cmakeBuildPreset) {
      const buildTool: baselib.ToolRunner = this.baseLib.tool(cmake);
      await this.build(buildTool, this.cmakeBuildPreset);
    }

    if (this.cmakeTestPreset) {
      const testTool: baselib.ToolRunner = this.baseLib.tool(ctest);
      await this.test(testTool, this.cmakeTestPreset);
    }

    this.baseLib.debug('run()>>');
  }

  private async test(cmake: baselib.ToolRunner, testPresetName: string): Promise<void> {
    this.baseLib.debug('test()<<');
    baseutillib.setEnvVarIfUndefined("TEST_PRESET_NAME", testPresetName);
    const args: string = baseutillib.replaceFromEnvVar(this.testPresetCmdStringFormat);
    const cmakeArgs: string[] = eval(args);

    this.baseLib.debug(`CTest arguments: ${cmakeArgs}`);
    for (const arg of cmakeArgs) {
      cmake.arg(arg);
    }

    this.baseLib.debug(`Testing with CTest ...`);
    await this.baseUtils.wrapOp("Test with CTest",
      async () => await this.launchCMake(
        cmake,
        this.cmakeSourceDir,
        this.logFilesCollector));

    this.baseLib.debug('test()>>');
  }

  private async build(cmake: baselib.ToolRunner, buildPresetName: string): Promise<void> {
    this.baseLib.debug('build()<<');

    baseutillib.setEnvVarIfUndefined("BUILD_PRESET_NAME", buildPresetName);
    const args: string = baseutillib.replaceFromEnvVar(this.buildPresetCmdStringFormat);
    const cmakeArgs: string[] = eval(args);
    this.baseLib.debug(`CMake arguments: ${cmakeArgs}`);
    for (const arg of cmakeArgs) {
      cmake.arg(arg);
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
    // Transform to array.
    const cmakeArgs: string[] = eval(args);
    this.baseLib.debug(`CMake arguments: ${cmakeArgs}`);
    for (const arg of cmakeArgs) {
      cmake.arg(arg);
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
}
