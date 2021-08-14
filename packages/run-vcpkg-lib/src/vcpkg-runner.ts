// Copyright (c) 2019-2020-2021 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as path from 'path';
import * as baselib from '@lukka/base-lib';
import * as globals from './vcpkg-globals';
import * as baseutillib from '@lukka/base-util-lib';
import { using } from "using-statement";

export class VcpkgRunner {
  private static readonly vcpkgInstallCmdDefault: string = `install --recurse --clean-after-build`;

  /**
   * @description Used only in tests.
   */
  public static async create(
    baselib: baselib.BaseLib,
    vcpkgInstallCmd?: string): Promise<VcpkgRunner> {
    const baseUtils = new baseutillib.BaseUtilLib(baselib);
    const defaultVcpkgUrl = 'https://github.com/microsoft/vcpkg.git';
    const vcpkgURL =
      baselib.getInput(globals.vcpkgGitURL, false) || defaultVcpkgUrl;
    const vcpkgCommitId =
      baselib.getInput(globals.vcpkgCommitId, false);
    let vcpkgDestPath = baselib.getPathInput(globals.vcpkgDirectory, false, false) ?? "";
    if (!vcpkgDestPath) {
      vcpkgDestPath = path.join(await baselib.getBinDir(), 'vcpkg');
    }

    const doRunVcpkgInstall = baselib.getBoolInput(globals.doRunVcpkg, false) ?? false;
    const doNotUpdateVcpkg = baselib.getBoolInput(globals.doNotUpdateVcpkg, false) ?? false;

    // Git update or clone depending on content of vcpkgDestPath input parameter.
    const pathToLastBuiltCommitId = path.join(vcpkgDestPath, globals.vcpkgLastBuiltCommitId);

    const regs = baselib.getDelimitedInput(globals.logCollectionRegExps, ';', false);
    const logFilesCollector = new baseutillib.LogFileCollector(baselib,
      regs, (path: string) => baseutillib.dumpFile(baselib, path));

    const options = {
      cwd: vcpkgDestPath,
      failOnStdErr: false,
      errStream: process.stdout,
      outStream: process.stdout,
      ignoreReturnCode: true,
      silent: false,
      windowsVerbatimArguments: false,
      env: process.env,
      listeners: {
        stdout: (t: Buffer): void => logFilesCollector.handleOutput(t),
        stderr: (t: Buffer): void => logFilesCollector.handleOutput(t),
      }
    } as baselib.ExecOptions;

    return new VcpkgRunner(
      baselib,
      baseUtils,
      vcpkgDestPath,
      vcpkgURL,
      doRunVcpkgInstall,
      doNotUpdateVcpkg,
      pathToLastBuiltCommitId,
      options,
      vcpkgCommitId,
      vcpkgInstallCmd);
  }

  public static async run(baselib: baselib.BaseLib, vcpkgInstallCmd?: string): Promise<void> {
    const vcpkgRunner: VcpkgRunner = await VcpkgRunner.create(baselib, vcpkgInstallCmd);
    await vcpkgRunner.run();
  }

  /**
   * @description Used only in tests.
   */
  protected constructor(
    private tl: baselib.BaseLib,
    private baseUtils: baseutillib.BaseUtilLib,
    private readonly vcpkgDestPath: string,
    private readonly vcpkgURL: string,
    private readonly doRunVcpkgInstall: boolean,
    private readonly doNotUpdateVcpkg: boolean = false,
    private readonly pathToLastBuiltCommitId: string,
    private readonly options: baselib.ExecOptions = {} as baselib.ExecOptions,
    private readonly vcpkgCommitId?: string,
    private vcpkgInstallCmd: string = VcpkgRunner.vcpkgInstallCmdDefault) {
  }

  public async run(): Promise<void> {
    await using(baseutillib.Matcher.createMatcher('all', this.baseUtils.baseLib, __dirname),
      async () => this.runImpl());
  }

  protected async runImpl(): Promise<void> {
    this.tl.debug("vcpkg runner starting...");

    this.baseUtils.wrapOpSync("Set output env vars", () => this.setOutputs());

    // Ensuring `this.vcpkgDestPath` is existent, since is going to be used as current working directory.
    if (!await this.tl.exist(this.vcpkgDestPath)) {
      this.tl.debug(`Creating vcpkg root directory as it is not existing: ${this.vcpkgDestPath}`);
      await this.tl.mkdirP(this.vcpkgDestPath);
    }

    let needRebuild = false;
    const currentCommitId = await VcpkgRunner.getCommitId(this.baseUtils, this.options.cwd);
    if (this.doNotUpdateVcpkg) {
      this.tl.info(`Skipping any check to update vcpkg directory (${this.vcpkgDestPath}).`);
    } else {
      const updated = await this.baseUtils.wrapOp("Check whether vcpkg repository is up to date",
        () => this.checkRepoUpdated(currentCommitId),
      );
      if (!updated) {
        await this.baseUtils.wrapOp("Download vcpkg source code repository",
          () => this.cloneRepo());
        needRebuild = true;
      }
    }

    // Build is needed at the first check which is saying so.
    if (!needRebuild) {
      needRebuild = this.baseUtils.wrapOpSync("Check whether last vcpkg's build is up to date with sources", () => this.checkLastBuildCommitId(currentCommitId));
      if (!needRebuild) {
        needRebuild = await this.baseUtils.wrapOp("Check vcpkg executable exists", () => this.checkExecutable());
      }
    }

    if (needRebuild) {
      await this.baseUtils.wrapOp("Build vcpkg executable", () => this.build());
    }

    if (this.doRunVcpkgInstall) {
      await this.baseUtils.wrapOp("Install/Update ports using vcpkg.json", () => this.runVcpkgInstall());
    }
  }

  private async runVcpkgInstall(): Promise<void> {
    let vcpkgPath: string = path.join(this.vcpkgDestPath, 'vcpkg');
    if (this.baseUtils.isWin32()) {
      vcpkgPath += '.exe';
    }
    const vcpkgTool = this.tl.tool(vcpkgPath);
    vcpkgTool.line(this.vcpkgInstallCmd);
    this.tl.info(
      `Running 'vcpkg ${this.vcpkgInstallCmd}' in directory '${this.vcpkgDestPath}' ...`);
    this.baseUtils.throwIfErrorCode(await vcpkgTool.exec(this.options));
  }

  private setOutputs(): void {
    // Set the RUNVCPKG_VCPKG_ROOT value, it could be re-used later by run-cmake.
    this.baseUtils.setEnvVar(globals.outVcpkgRootPath, this.vcpkgDestPath);
    // Override the VCPKG_ROOT value, it must point to this vcpkg instance, it is used by 
    // any subsequent invocation of the vcpkg executable.
    this.baseUtils.setEnvVar(globals.vcpkgRoot, this.vcpkgDestPath);

    // The output variable must have a different name than the
    // one set with setVariable(), as the former get a prefix added out of our control.
    const outVarName = `${globals.outVcpkgRootPath}_OUT`;
    this.tl.info(`Set the output variable '${outVarName}' to value: ${this.vcpkgDestPath}`);
    this.tl.setOutput(`${outVarName}`, this.vcpkgDestPath);
  }

  /**
   *
   * Get the commit id of the repository at the directory specified in 'path' parameter.
   * @static
   * @param {baseutillib.BaseUtilLib} baseUtilLib The BaseUtilLib instance to use.
   * @param {string} path Path of the repository.
   * @returns {Promise<string>} The commit id of the repository at given path.
   * @memberof VcpkgRunner
   */
  public static async getCommitId(baseUtilLib: baseutillib.BaseUtilLib, path: string): Promise<string> {
    const options = {
      cwd: path,
      failOnStdErr: false,
      errStream: process.stdout,
      outStream: process.stdout,
      ignoreReturnCode: true,
      silent: false,
      windowsVerbatimArguments: false,
      env: process.env
    } as baselib.ExecOptions;

    baseUtilLib.baseLib.debug("getCommitId()<<");
    let currentCommitId = "";
    const gitPath = await baseUtilLib.baseLib.which('git', true);
    // Use git to verify whether the repo is up to date.
    const gitRunner: baselib.ToolRunner = baseUtilLib.baseLib.tool(gitPath);
    gitRunner.arg(['rev-parse', 'HEAD']);
    baseUtilLib.baseLib.info(`Fetching the Git commit id at '${path}' ...`);
    const res: baselib.ExecResult = await gitRunner.execSync(options);
    if (res.code === 0) {
      currentCommitId = baseUtilLib.trimString(res.stdout);
      baseUtilLib.baseLib.debug(`git rev-parse: code=${res.code}, stdout=${baseUtilLib.trimString(res.stdout)}, stderr=${baseUtilLib.trimString(res.stderr)}`);
    } else /* if (res.code !== 0) */ {
      baseUtilLib.baseLib.debug(`error executing git: code=${res.code}, stdout=${baseUtilLib.trimString(res.stdout)}, stderr=${baseUtilLib.trimString(res.stderr)}`);
      baseUtilLib.baseLib.info(`Git commit id not found.`);
    }
    baseUtilLib.baseLib.debug(`getCommitId()>> -> ${currentCommitId}`);
    return currentCommitId;
  }

  private async checkRepoUpdated(currentCommitId: string): Promise<boolean> {
    this.tl.info(`Checking whether vcpkg's repository is updated to commit id '${currentCommitId}' ...`);
    let updated = false;

    const gitPath = await this.tl.which('git', true);
    const isSubmodule = await this.baseUtils.isVcpkgSubmodule(gitPath, this.vcpkgDestPath);
    if (isSubmodule) {
      // In case vcpkg it is a Git submodule...
      this.tl.info(`'vcpkg' is detected as a submodule.`);
      updated = true;

      // Issue a warning if the vcpkgCommitId is specified.
      if (this.vcpkgCommitId) {
        this.tl.warning(`Since the vcpkg directory '${this.vcpkgDestPath}' is a submodule, the input '${globals.vcpkgCommitId}' should not be provided (${this.vcpkgCommitId})`);
      }
    } else {
      const res: boolean = this.baseUtils.directoryExists(this.vcpkgDestPath);
      this.tl.debug(`exist('${this.vcpkgDestPath}') === ${res}`);
      if (res && !isSubmodule) {
        // Use git to verify whether the repo is up to date.
        this.tl.info(`Current commit id of vcpkg: '${currentCommitId}'.`);
        if (!this.vcpkgCommitId) {
          throw new Error(`'${globals.vcpkgCommitId}' input parameter must be provided when the specified vcpkg directory (${this.vcpkgDestPath}) is not a submodule.`);
        }

        if (!baseutillib.BaseUtilLib.isValidSHA1(this.vcpkgCommitId)) {
          throw new Error(`'${globals.vcpkgCommitId}' input parameter must be a full SHA1 hash (40 hex digits).`);
        }

        if (this.vcpkgCommitId === currentCommitId) {
          this.tl.info(`Repository is up to date to requested commit id '${this.vcpkgCommitId}'`);
          updated = true;
        }
      }
    }

    this.tl.info(`Is vcpkg repository updated? ${updated ? "Yes" : "No"}`);
    return updated;
  }

  private checkLastBuildCommitId(vcpkgCommitId: string): boolean {
    this.tl.info(`Checking last vcpkg build commit id in file '${this.pathToLastBuiltCommitId}' ...`);
    let rebuild = true;// Default is true.
    const lastCommitIdLast = this.baseUtils.readFile(this.pathToLastBuiltCommitId);
    this.tl.debug(`last build check: ${lastCommitIdLast}`);
    if (lastCommitIdLast) {
      this.tl.debug(`lastcommitid = ${lastCommitIdLast}, currentcommitid = ${vcpkgCommitId}`);
      if (lastCommitIdLast === vcpkgCommitId) {
        rebuild = false;
        this.tl.info(`vcpkg executable is up to date with sources.`);
      } else {
        this.tl.info(`vcpkg executable is out of date with sources.`);
      }
    } else {
      rebuild = true; // Force a rebuild.
      this.tl.info(`There is no file containing last built commit id of vcpkg, forcing a rebuild.`);
    }

    return rebuild;
  }

  private async cloneRepo(): Promise<void> {
    this.tl.info(`Cloning vcpkg in '${this.vcpkgDestPath}'...`);
    if (!this.vcpkgCommitId) {
      throw new Error(`When the vcpkg directory is empty, the input parameter '${globals.vcpkgCommitId}' must be provided to git clone the repository.`);
    }
    const gitPath = await this.tl.which('git', true);

    await this.tl.rmRF(this.vcpkgDestPath);
    await this.tl.mkdirP(this.vcpkgDestPath);
    this.tl.cd(this.vcpkgDestPath);

    let gitTool = this.tl.tool(gitPath);

    gitTool.arg(['clone', this.vcpkgURL, '-n', '.']);
    this.baseUtils.throwIfErrorCode(await gitTool.exec(this.options));

    gitTool = this.tl.tool(gitPath);
    gitTool.arg(['checkout', '--force', this.vcpkgCommitId]);
    this.baseUtils.throwIfErrorCode(await gitTool.exec(this.options));
    this.tl.info(`Clone vcpkg in '${this.vcpkgDestPath}'.`);
  }

  private async checkExecutable(): Promise<boolean> {
    let needRebuild = false;
    // If the executable file ./vcpkg/vcpkg is not present or it is not wokring, force build. The fact that 'the repository is up to date' is meaningless.
    const vcpkgExePath: string = this.baseUtils.getVcpkgExePath(this.vcpkgDestPath);
    if (!this.baseUtils.fileExists(vcpkgExePath)) {
      this.tl.info("Building vcpkg is necessary as executable is missing.");
      needRebuild = true;
    } else {
      if (!this.baseUtils.isWin32()) {
        await this.tl.execSync('chmod', ["+x", vcpkgExePath])
      }
      this.tl.info(`vcpkg executable exists at: '${vcpkgExePath}'.`);
      const result = await this.tl.execSync(vcpkgExePath, ['version']);
      if (result.code != 0) {
        needRebuild = true;
        this.tl.info(`vcpkg executable returned code ${result.code}, forcing a rebuild.`);
      }
    }

    return needRebuild;
  }

  private async build(): Promise<void> {
    // Build vcpkg.
    let bootstrapFileName = 'bootstrap-vcpkg';
    if (this.baseUtils.isWin32()) {
      bootstrapFileName += '.bat';
    } else {
      bootstrapFileName += '.sh';
    }

    if (this.baseUtils.isWin32()) {
      const cmdPath: string = await this.tl.which('cmd.exe', true);
      const cmdTool = this.tl.tool(cmdPath);
      cmdTool.arg(['/c', path.join(this.vcpkgDestPath, bootstrapFileName)]);
      this.baseUtils.throwIfErrorCode(await cmdTool.exec(this.options));
    } else {
      const shPath: string = await this.tl.which('sh', true);
      const shTool = this.tl.tool(shPath);
      const bootstrapFullPath: string = path.join(this.vcpkgDestPath, bootstrapFileName);
      if (!this.baseUtils.isWin32()) {
        await this.tl.execSync('chmod', ["+x", bootstrapFullPath]);
      }
      shTool.arg(['-c', bootstrapFullPath]);
      this.baseUtils.throwIfErrorCode(await shTool.exec(this.options));
    }

    // After a build, refetch the commit id of the vcpkg's repo, and store it into the file.
    const builtCommitId = await VcpkgRunner.getCommitId(this.baseUtils, this.options.cwd);
    this.baseUtils.writeFile(this.pathToLastBuiltCommitId, builtCommitId);
    // Keep track of last successful build commit id.
    this.tl.info(`Stored last built vcpkg commit id '${builtCommitId}' in file '${this.pathToLastBuiltCommitId}`);
  }

  private setEnvOutTriplet(envVarName: string, outVarName: string, triplet: string): void {
    this.baseUtils.setEnvVar(envVarName, triplet);
    this.tl.info(`Set the environment variable '${envVarName}' to value: ${triplet}`);

    this.tl.setVariable(outVarName, triplet);
    this.tl.info(`Set the output variable '${outVarName}' to value: ${triplet}`);
  }
}
