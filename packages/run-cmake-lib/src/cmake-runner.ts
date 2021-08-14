// Copyright (c) 2019-2020-2021 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as baselib from '@lukka/base-lib';
import * as baseutillib from '@lukka/base-util-lib';
import * as path from 'path';
import * as cmakeglobals from './cmake-globals';
import { using } from "using-statement";
import * as cmakelib from './utils'
import * as fs from 'fs';
import { assert } from 'console';

export class CMakeRunner {
  private readonly baseUtils: baseutillib.BaseUtilLib;
  private readonly cmakeUtils: cmakelib.CMakeUtils;
  private readonly buildDir: string = "";
  private readonly appendedArgs: string;
  private readonly cmakeListsTxtPath: string;
  private readonly doBuild: boolean;
  private readonly doBuildArgs: string;
  private readonly cmakeSourceDir: string;
  private readonly useVcpkgToolchainFile: boolean;
  private readonly vcpkgTriplet: string;
  private readonly sourceScript: string;
  private readonly logFilesCollector: baseutillib.LogFileCollector;

  public constructor(
    private tl: baselib.BaseLib) {
    this.baseUtils = new baseutillib.BaseUtilLib(this.tl);
    this.cmakeUtils = new cmakelib.CMakeUtils(this.baseUtils);
    const regs = this.tl.getDelimitedInput(cmakeglobals.logCollectionRegExps, ';', false);
    this.logFilesCollector = new baseutillib.LogFileCollector(this.tl,
      regs, (path: string) => baseutillib.dumpFile(this.tl, path));

    this.cmakeListsTxtPath = this.tl.getPathInput(
      cmakeglobals.cmakeListsTxtPath,
      true, true) ?? "";

    this.buildDir = this.tl.getInput(
      cmakeglobals.buildDirectory,
      false) ?? "";
    this.appendedArgs = this.tl.getInput(
      cmakeglobals.cmakeAppendedArgs,
      false) ?? "";

    this.doBuild = this.tl.getBoolInput(cmakeglobals.buildWithCMake, false) ?? false;
    this.doBuildArgs = this.tl.getInput(cmakeglobals.buildWithCMakeArgs, false) ?? "";
    this.cmakeSourceDir = path.dirname(baseutillib.BaseUtilLib.normalizePath(this.cmakeListsTxtPath) ?? "");

    this.useVcpkgToolchainFile =
      this.tl.getBoolInput(cmakeglobals.useVcpkgToolchainFile, false) ?? false;

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
    let cmakeArgs: string[] = [];

    // Search for CMake tool and run it.
    let cmake: baselib.ToolRunner;
    if (this.sourceScript) {
      cmake = this.tl.tool(this.sourceScript);
      cmakeArgs.push(await this.tl.which('cmake', true));
    } else {
      cmake = this.tl.tool(await this.tl.which('cmake', true));
    }

    if (this.appendedArgs) {
      this.tl.debug(`Parsing additional CMake args: ${this.appendedArgs}`);
      const addedArgs: string[] = cmake._argStringToArray(this.appendedArgs);
      this.tl.debug(`Appending args: ${JSON.stringify(addedArgs)}`);
      cmakeArgs = [...cmakeArgs, ...addedArgs];
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
      env: process.env,
      listeners: {
        stdout: (t: Buffer): void => this.logFilesCollector.handleOutput(t),
        stderr: (t: Buffer): void => this.logFilesCollector.handleOutput(t),
      }
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
            await CMakeRunner.build(this.tl, this.buildDir, this.doBuildArgs, options))
        });
    }
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

  private static getCompilerMatcher(line: string): string | null {
    let matcherName: string | null = null;
    if (line.includes('g++') || line.includes('gcc') || line.includes('c++'))
      matcherName = CMakeRunner.gccMatcher;
    else if (line.includes('cl.exe'))
      matcherName = CMakeRunner.msvcMatcher;
    else if (line.includes('clang'))
      matcherName = CMakeRunner.clangMatcher;
    return matcherName;
  }

  public static getBuildMatcher(buildDir: string, tl: baselib.BaseLib): string {
    let cxxMatcher: string | null = null;
    let ccMatcher: string | null = null;
    const utils: baseutillib.BaseUtilLib = new baseutillib.BaseUtilLib(tl);
    try {
      const cmakeCacheTxtPath = path.join(buildDir, "CMakeCache.txt");
      const cacheContent = utils.readFile(cmakeCacheTxtPath);
      tl.debug(`Loaded fileCMakeCache.txt at path='${cmakeCacheTxtPath}'`);
      if (cacheContent) {
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
      tl.debug(error as string ?? error);
    }

    const defaultMatcher: string = CMakeRunner.getDefaultMatcher();
    tl.debug(`Default matcher according to platform is: ${defaultMatcher}`);

    const selectedMatcher = cxxMatcher ?? ccMatcher ?? defaultMatcher
    tl.debug(`Selected matcher: ${selectedMatcher}`);
    return selectedMatcher;
  }
}
