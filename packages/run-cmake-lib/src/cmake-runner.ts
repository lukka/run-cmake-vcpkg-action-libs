// Copyright (c) 2019-2020-2021 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as baselib from '@lukka/base-lib';
import * as baseutillib from '@lukka/base-util-lib';
import * as path from 'path';
import * as cmakeglobals from './cmake-globals';
import { using } from "using-statement";
import * as cmakelib from './utils'

export class CMakeRunner {
  private static readonly configurePresetDefault = "[`--preset`, `$(name)`]";
  private static readonly buildPresetDefault = "[`--build`, `--preset`, `$(name)`]";
  private static readonly testPresetDefault = "[`--preset`, `$(name)`]";

  private readonly baseUtils: baseutillib.BaseUtilLib;
  private readonly cmakeUtils: cmakelib.CMakeUtils;
  private readonly cmakeListsTxtPath: string;
  private readonly cmakeConfigurePreset: string | null;
  private readonly cmakeBuildPreset: string | null;
  private readonly cmakeTestPreset: string | null;
  private readonly cmakeSourceDir: string;
  private readonly vcpkgTriplet: string | null = null;
  private readonly logFilesCollector: baseutillib.LogFileCollector;

  public static async run(baseLib: baselib.BaseLib,
    configurePresetStringCmd?: string,
    buildPresetStringCmd?: string,
    testPresetStringCmd?: string): Promise<void> {
    await using(baseutillib.Matcher.createMatcher('all', baseLib, __dirname),
      async () => {
        const cmakeRunner: CMakeRunner = new CMakeRunner(
          baseLib,
          configurePresetStringCmd,
          buildPresetStringCmd,
          testPresetStringCmd);
        await cmakeRunner.run();
      });
  }

  public constructor(
    private baseLib: baselib.BaseLib,
    private configurePresetStringCmd: string = CMakeRunner.configurePresetDefault,
    private buildPresetStringCmd: string = CMakeRunner.buildPresetDefault,
    private testPresetStringCmd: string = CMakeRunner.testPresetDefault) {
    this.baseUtils = new baseutillib.BaseUtilLib(this.baseLib);
    this.cmakeUtils = new cmakelib.CMakeUtils(this.baseUtils);
    const regs = this.baseLib.getDelimitedInput(cmakeglobals.logCollectionRegExps, ';', false);
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

    this.vcpkgTriplet = this.baseLib.getInput(cmakeglobals.cmakeVcpkgTriplet, false) ?? null;
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
    const cmakeArgs: string[] = eval(this.testPresetStringCmd.replace("$(name)", testPresetName));

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

    const cmakeArgs: string[] = eval(this.buildPresetStringCmd.replace("$(name)", buildPresetName));
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

    const cmakeArgs: string[] = eval(this.configurePresetStringCmd.replace("$(name)", configurePresetName));
    this.baseLib.debug(`CMake arguments: ${cmakeArgs}`);
    for (const arg of cmakeArgs) {
      cmake.arg(arg);
    }

    // Use vcpkg toolchain if requested, and setenvironment using the triplet (used to setup the environment for MSVC on Windows).
    if (this.vcpkgTriplet) {
      await this.cmakeUtils.setEnvironmentForVcpkgTriplet(this.vcpkgTriplet, this.baseLib)
    }

    this.baseLib.debug(`Generating project files with CMake ...`);
    await this.baseUtils.wrapOp("Generate project files with CMake",
      async () => await this.launchCMake(cmake, this.cmakeSourceDir, this.logFilesCollector));
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
