// Copyright (c) 2019-2020-2021-2022-2023-2024 Luca Cappa
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
  public static readonly workflowPresetDefault = "[`--workflow`, `--preset`, `$[env.WORKFLOW_PRESET_NAME]`, `--fresh`]";
  public static readonly configurePresetDefault = "[`--preset`, `$[env.CONFIGURE_PRESET_NAME]`]";
  public static readonly buildPresetDefault = "[`--build`, `--preset`, `$[env.BUILD_PRESET_NAME]`]";
  public static readonly testPresetDefault = "[`--preset`, `$[env.TEST_PRESET_NAME]`]";
  public static readonly packagePresetDefault = "[`--preset`, `$[env.PACKAGE_PRESET_NAME]`]";
  public static readonly vcpkgEnvDefault = "[`env`, `--bin`, `--include`, `--tools`, `--python`, `--triplet $[env.VCPKG_DEFAULT_TRIPLET]`, `set`]";

  private readonly baseUtils: baseutillib.BaseUtilLib;
  private readonly cmakeListsTxtPath: string;
  private readonly cmakeSourceDir: string;
  private readonly logFilesCollector: baseutillib.LogFileCollector;

  private msvcSetup = false;

  public static async run(baseLib: baselib.BaseLib,
    workflowPreset?: string,
    workflowPresetCmdStringFormat?: string,
    configurePreset?: string,
    configurePresetCmdStringFormat?: string,
    configurePresetCmdStringAddArgs?: string,
    buildPreset?: string,
    buildPresetCmdStringFormat?: string,
    buildPresetCmdStringAddArgs?: string,
    testPreset?: string,
    testPresetCmdStringFormat?: string,
    testPresetCmdStringAddArgs?: string,
    packagePreset?: string,
    packagePresetCmdStringFormat?: string,
    packagePresetCmdStringAddArgs?: string,
    vcpkgEnvCmdStringFormat?: string): Promise<void> {
    await using(baseutillib.Matcher.createMatcher('all', baseLib, __dirname),
      async () => {
        const cmakeRunner: CMakeRunner = new CMakeRunner(
          baseLib,
          workflowPreset,
          workflowPresetCmdStringFormat,
          configurePreset,
          configurePresetCmdStringFormat,
          configurePresetCmdStringAddArgs,
          buildPreset,
          buildPresetCmdStringFormat,
          buildPresetCmdStringAddArgs,
          testPreset,
          testPresetCmdStringFormat,
          testPresetCmdStringAddArgs,
          packagePreset,
          packagePresetCmdStringFormat,
          packagePresetCmdStringAddArgs,
          vcpkgEnvCmdStringFormat);
        await cmakeRunner.run();
      });
  }

  public constructor(
    private baseLib: baselib.BaseLib,
    private workflowPreset: string | null = null,
    private workflowPresetCmdStringFormat: string = CMakeRunner.workflowPresetDefault,
    private configurePreset: string | null = null,
    private configurePresetCmdStringFormat: string = CMakeRunner.configurePresetDefault,
    private configurePresetCmdStringAddArgs: string | null = null,
    private buildPreset: string | null = null,
    private buildPresetCmdStringFormat: string = CMakeRunner.buildPresetDefault,
    private buildPresetCmdStringAddArgs: string | null = null,
    private testPreset: string | null = null,
    private testPresetCmdStringFormat: string = CMakeRunner.testPresetDefault,
    private testPresetCmdStringAddArgs: string | null = null,
    private packagePreset: string | null = null,
    private packagePresetCmdStringFormat: string = CMakeRunner.packagePresetDefault,
    private packagePresetCmdStringAddArgs: string | null = null,
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
    const cpack: string = await this.baseLib.which('cpack', true);
    this.baseLib.debug(`cpack located at: '${cpack}'.`);

    let onePresetInputProvided = false;

    if (this.workflowPreset) {
      onePresetInputProvided = true;
      const workflowTool: baselib.ToolRunner = this.baseLib.tool(cmake);
      await this.workflow(workflowTool, this.workflowPreset);
    } else {
      if (this.configurePreset) {
        onePresetInputProvided = true;
        const configureTool: baselib.ToolRunner = this.baseLib.tool(cmake);
        await this.configure(configureTool, this.configurePreset);
      }

      if (this.buildPreset) {
        onePresetInputProvided = true;
        const buildTool: baselib.ToolRunner = this.baseLib.tool(cmake);
        await this.build(buildTool, this.buildPreset);
      }

      if (this.testPreset) {
        onePresetInputProvided = true;
        const testTool: baselib.ToolRunner = this.baseLib.tool(ctest);
        await this.test(testTool, this.testPreset);
      }

      if (this.packagePreset) {
        onePresetInputProvided = true;
        const packageTool: baselib.ToolRunner = this.baseLib.tool(cpack);
        await this.package(packageTool, this.packagePreset);
      }
    }

    if (!onePresetInputProvided) {
      throw new Error(`"Error: no preset has been specified in any of the inputs. Please provide at least the name of one preset.`);

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
      async () => await this.launchTool(
        ctest,
        this.cmakeSourceDir,
        this.logFilesCollector));

    this.baseLib.debug('test()>>');
  }

  private async package(cpack: baselib.ToolRunner, packagePresetName: string): Promise<void> {
    this.baseLib.debug('package()<<');
    baseutillib.setEnvVarIfUndefined("PACKAGE_PRESET_NAME", packagePresetName);
    CMakeRunner.addArguments(cpack, this.packagePresetCmdStringFormat);
    if (this.packagePresetCmdStringAddArgs) {
      CMakeRunner.addArguments(cpack, this.packagePresetCmdStringAddArgs);
    }

    this.baseLib.debug(`test: Packaging with CPack ...`);
    await this.baseUtils.wrapOp("Package with CPack",
      async () => await this.launchTool(
        cpack,
        this.cmakeSourceDir,
        this.logFilesCollector));

    this.baseLib.debug('package()>>');
  }

  private async build(cmake: baselib.ToolRunner, buildPresetName: string): Promise<void> {
    this.baseLib.debug('build()<<');

    baseutillib.setEnvVarIfUndefined("BUILD_PRESET_NAME", buildPresetName);
    CMakeRunner.addArguments(cmake, this.buildPresetCmdStringFormat);
    if (this.buildPresetCmdStringAddArgs) {
      CMakeRunner.addArguments(cmake, this.buildPresetCmdStringAddArgs);
    }

    this.baseLib.debug(`test: Building with CMake ...`);
    await this.baseUtils.wrapOp("Build with CMake",
      async () => await this.launchTool(
        cmake,
        this.cmakeSourceDir,
        this.logFilesCollector));

    this.baseLib.debug('build()>>');
  }

  private async configure(cmake: baselib.ToolRunner, configurePresetName: string): Promise<void> {
    this.baseLib.debug('configure()<<');

    baseutillib.setEnvVarIfUndefined("CONFIGURE_PRESET_NAME", configurePresetName);
    CMakeRunner.addArguments(cmake, this.configurePresetCmdStringFormat);
    if (this.configurePresetCmdStringAddArgs) {
      CMakeRunner.addArguments(cmake, this.configurePresetCmdStringAddArgs);
    }

    // 
    this.baseLib.debug(`Generating project files with CMake ...`);
    await this.baseUtils.wrapOp("Generate project files with CMake",
      async () => await this.launchTool(cmake, this.cmakeSourceDir, this.logFilesCollector));

    this.baseLib.debug('configure()>>');
  }

  private async workflow(cmake: baselib.ToolRunner, workflowPresetName: string): Promise<void> {
    this.baseLib.debug('workflow()<<');
    baseutillib.setEnvVarIfUndefined("WORKFLOW_PRESET_NAME", workflowPresetName);
    CMakeRunner.addArguments(cmake, this.workflowPresetCmdStringFormat);

    // 
    this.baseLib.debug(`Running the workflow preset named '${workflowPresetName}' ...`);
    await this.baseUtils.wrapOp(`Running workflow '${workflowPresetName}' with CMake`,
      async () => await this.launchTool(cmake, this.cmakeSourceDir, this.logFilesCollector));

    this.baseLib.debug('workflow()>>');
  }

  private async launchTool(
    tool: baselib.ToolRunner,
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

    if (!this.msvcSetup) {
      this.msvcSetup = true;
      const vcpkgRoot: string | undefined = process.env[runvcpkglib.VCPKGROOT];
      await cmakeutil.setupMsvc(this.baseUtils, vcpkgRoot, this.vcpkgEnvStringFormat);
    }

    const code = await tool.exec(options);

    if (code !== 0) {
      throw new Error(`"'${tool.getName()}' failed with error code: '${code}'.`);
    }
  }

  private static addArguments(tool: baselib.ToolRunner, args: string) {
    const additionalArgs: string = baseutillib.replaceFromEnvVar(args);
    const evaluatedArgs: string[] = eval(additionalArgs);
    for (const arg of evaluatedArgs) {
      tool.arg(arg);
    }
  }
}
