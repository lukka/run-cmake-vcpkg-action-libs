// Copyright (c) 2019-2020-2021 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as path from 'path';
import * as baselib from '@lukka/base-lib';
import * as globals from './vcpkg-globals';
import * as vcpkgutils from './vcpkg-utils';
import * as baseutillib from '@lukka/base-util-lib';
import { using } from "using-statement";

export class VcpkgRunner {
  public static readonly VCPKGINSTALLCMDDEFAULT: string = '[`install`, `--recurse`, `--clean-after-build`, `--x-install-root`, `$[env.VCPKG_INSTALLED_DIR]`, `--triplet`, `$[env.VCPKG_DEFAULT_TRIPLET]`]';
  public static readonly DEFAULTVCPKGURL = 'https://github.com/microsoft/vcpkg.git';
  protected static readonly VCPKG_ENABLE_METRICS = "VCPKG_ENABLE_METRICS";
  protected static readonly VCPKG_DISABLE_METRICS = "VCPKG_DISABLE_METRICS";

  /**
   * @description Used only in tests.
   */
  public static async create(
    baseUtil: baseutillib.BaseUtilLib,
    vcpkgDestPath: string,
    vcpkgUrl: string | null,
    vcpkgGitCommitId: string | null,
    doRunVcpkgInstall: boolean,
    doNotUpdateVcpkg: boolean,
    logCollectionRegExps: string[],
    runVcpkgInstallPath: string | null,
    vcpkgInstallCmd: string | null): Promise<VcpkgRunner> {
    if (!vcpkgUrl) {
      vcpkgUrl = VcpkgRunner.DEFAULTVCPKGURL;
      baseUtil.baseLib.info(`The vcpkg's URL Git repository is not provided, using the predefined: '${VcpkgRunner.DEFAULTVCPKGURL}'`);
    }

    baseutillib.setEnvVarIfUndefined("VCPKG_INSTALLED_DIR", await vcpkgutils.getDefaultVcpkgInstallDirectory(baseUtil.baseLib));
    baseutillib.setEnvVarIfUndefined(globals.VCPKGDEFAULTTRIPLET, baseUtil.getDefaultTriplet());
    if (!vcpkgInstallCmd) {
      vcpkgInstallCmd = baseutillib.replaceFromEnvVar(VcpkgRunner.VCPKGINSTALLCMDDEFAULT);
    } else {
      vcpkgInstallCmd = baseutillib.replaceFromEnvVar(vcpkgInstallCmd);
    }

    const vcpkgInstallArgs: string[] = eval(vcpkgInstallCmd);

    // Git update or clone depending on content of vcpkgDestPath input parameter.
    const pathToLastBuiltCommitId = path.join(vcpkgDestPath, globals.vcpkgLastBuiltCommitId);

    const logFilesCollector = new baseutillib.LogFileCollector(baseUtil.baseLib,
      logCollectionRegExps, (path: string) => baseutillib.dumpFile(baseUtil.baseLib, path));

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
      baseUtil,
      vcpkgDestPath,
      vcpkgUrl,
      vcpkgGitCommitId,
      doRunVcpkgInstall,
      doNotUpdateVcpkg,
      runVcpkgInstallPath,
      pathToLastBuiltCommitId,
      options,
      vcpkgInstallArgs);
  }

  public static async run(
    baseUtil: baseutillib.BaseUtilLib,
    vcpkgRootPath: string,
    vcpkgUrl: string | null,
    vcpkgGitCommitId: string | null,
    doRunVcpkgInstall: boolean,
    doNotUpdateVcpkg: boolean,
    logCollectionRegExps: string[],
    runVcpkgInstallPath: string | null,
    vcpkgInstallCmd: string | null): Promise<void> {
    const vcpkgRunner: VcpkgRunner = await VcpkgRunner.create(
      baseUtil,
      vcpkgRootPath,
      vcpkgUrl,
      vcpkgGitCommitId,
      doRunVcpkgInstall,
      doNotUpdateVcpkg,
      logCollectionRegExps,
      runVcpkgInstallPath,
      vcpkgInstallCmd);
    await vcpkgRunner.run();
  }

  /**
   * @description Used only in tests.
   */
  protected constructor(
    private readonly baseUtils: baseutillib.BaseUtilLib,
    private readonly vcpkgDestPath: string,
    private readonly vcpkgUrl: string,
    private readonly vcpkgGitCommitId: string | null,
    private readonly doRunVcpkgInstall: boolean,
    private readonly doNotUpdateVcpkg: boolean,
    private readonly runVcpkgInstallPath: string | null,
    private readonly pathToLastBuiltCommitId: string,
    private readonly options: baselib.ExecOptions = {} as baselib.ExecOptions,
    private vcpkgInstallCmd: string[]) {
  }

  public async run(): Promise<void> {
    await using(baseutillib.Matcher.createMatcher('all', this.baseUtils.baseLib, __dirname),
      async () => this.runImpl());
  }

  protected async runImpl(): Promise<void> {
    this.baseUtils.baseLib.debug("runImpl()<<");

    // By default disable vcpkg telemetry, unless VCPKG_ENABLE_METRICS is set.
    if (!process.env[VcpkgRunner.VCPKG_ENABLE_METRICS]) {
      process.env[VcpkgRunner.VCPKG_DISABLE_METRICS] = "1";
    }

    // Ensuring `this.vcpkgDestPath` is existent, since is going to be used as current working directory.
    if (!await this.baseUtils.baseLib.exist(this.vcpkgDestPath)) {
      this.baseUtils.baseLib.debug(`Creating vcpkg root directory as it is not existing: ${this.vcpkgDestPath}`);
      await this.baseUtils.baseLib.mkdirP(this.vcpkgDestPath);
    }

    let needRebuild = false;
    const currentCommitId = await this.baseUtils.wrapOp(`Retrieving the vcpkg Git commit id (${this.vcpkgDestPath})`,
      async () => await VcpkgRunner.getCommitId(this.baseUtils, this.vcpkgDestPath));
    if (this.doNotUpdateVcpkg) {
      this.baseUtils.baseLib.info(`DoNotUpdateVcpkg' is 'true', skipping any check to update the vcpkg directory (${this.vcpkgDestPath}).`);
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
      needRebuild = this.baseUtils.wrapOpSync("Check whether last vcpkg's build is up to date with sources",
        () => this.checkLastBuildCommitId(currentCommitId));
      if (!needRebuild) {
        needRebuild = await this.baseUtils.wrapOp("Check vcpkg executable exists", () => this.checkExecutable());
      }
    }

    if (needRebuild) {
      await this.baseUtils.wrapOp("Build vcpkg executable", () => this.build());
    }

    await this.runVcpkgInstall();

    this.baseUtils.wrapOpSync("Set output environment variables", () => this.setOutputs());

    this.baseUtils.baseLib.debug("runImpl()>>");
  }

  private async runVcpkgInstall(): Promise<void> {
    if (!this.doRunVcpkgInstall)
      return;

    if (!this.runVcpkgInstallPath) {
      throw new Error(`Cannot run '${this.vcpkgInstallCmd}' because no valid directory has been provided.`);
    }
    const vcpkgRunPath: string = this.runVcpkgInstallPath;

    await this.baseUtils.wrapOp("Install/Update ports using vcpkg.json",
      async () => await this.runVcpkgInstallImpl(vcpkgRunPath));
  }

  private async runVcpkgInstallImpl(vcpkgRunPath: string): Promise<void> {
    let vcpkgPath: string = path.join(this.vcpkgDestPath, 'vcpkg');
    if (this.baseUtils.isWin32()) {
      vcpkgPath += '.exe';
    }

    // A shallow copy the ExecOptions suffices.
    const optionsForRunningVcpkgInstall = { ...this.options };

    optionsForRunningVcpkgInstall.cwd = vcpkgRunPath;

    // Run the command.
    const vcpkgTool = this.baseUtils.baseLib.tool(vcpkgPath);
    for (const arg of this.vcpkgInstallCmd)
      vcpkgTool.arg(arg);
    this.baseUtils.baseLib.info(
      `Running 'vcpkg ${this.vcpkgInstallCmd}' in directory '${optionsForRunningVcpkgInstall.cwd}' ...`);
    this.baseUtils.throwIfErrorCode(await vcpkgTool.exec(optionsForRunningVcpkgInstall));
  }

  private setOutputs(): void {
    // Set the RUNVCPKG_VCPKG_ROOT value, it could be re-used later by run-cmake.
    this.baseUtils.setVariableVerbose(globals.RUNVCPKG_VCPKG_ROOT, this.vcpkgDestPath)
    // Override the VCPKG_ROOT value, it must point to this vcpkg instance, it is used by 
    // any subsequent invocation of the vcpkg executable.
    this.baseUtils.setVariableVerbose(globals.VCPKGROOT, this.vcpkgDestPath);

    // The output variable must have a different name than the
    // one set with setVariable(), as the former get a prefix added out of our control.
    const outVarName = `${globals.RUNVCPKG_VCPKG_ROOT}_OUT`;
    this.baseUtils.setOutputVerbose(outVarName, this.vcpkgDestPath);

    if (this.doRunVcpkgInstall) {
      // If vcpkg install was run, expose which triplet has been used to run it with.
      const triplet = process.env[globals.VCPKGDEFAULTTRIPLET];
      if (triplet) {
        this.baseUtils.setVariableVerbose(globals.VCPKGDEFAULTTRIPLET, triplet);
        const vcpkgTripletOutVarName = `${globals.RUNVCPKG_VCPKG_DEFAULT_TRIPLET}_OUT`;
        this.baseUtils.setOutputVerbose(vcpkgTripletOutVarName, triplet);
      } else {
        this.baseUtils.baseLib.warning(`Environment variable ${globals.VCPKGDEFAULTTRIPLET} is not defined. Cannot set the output/environment variables containing the used vcpkg's triplet.`);
      }
    }
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
    this.baseUtils.baseLib.info(`Checking whether vcpkg's repository is updated to commit id '${currentCommitId}' ...`);
    let updated = false;

    const gitPath = await this.baseUtils.baseLib.which('git', true);
    const isSubmodule = await this.baseUtils.isVcpkgSubmodule(gitPath, this.vcpkgDestPath);
    if (isSubmodule) {
      // In case vcpkg it is a Git submodule...
      this.baseUtils.baseLib.info(`'vcpkg' is detected as a submodule.`);
      updated = true;

      // Issue a warning if the vcpkgCommitId is specified.
      if (this.vcpkgGitCommitId) {
        this.baseUtils.baseLib.warning(`Since the vcpkg directory '${this.vcpkgDestPath}' is a submodule, the vcpkg's Git commit id is disregarded and should not be provided (${this.vcpkgGitCommitId})`);
      }
    } else {
      const res: boolean = this.baseUtils.directoryExists(this.vcpkgDestPath);
      this.baseUtils.baseLib.debug(`exist('${this.vcpkgDestPath}') === ${res}`);
      if (res && !isSubmodule) {
        // Use git to verify whether the repo is up to date.
        this.baseUtils.baseLib.info(`Current commit id of vcpkg: '${currentCommitId}'.`);
        if (!this.vcpkgGitCommitId) {
          throw new Error(`The vcpkg's Git commit id must be provided when the specified vcpkg directory (${this.vcpkgDestPath}) is not a submodule.`);
        }

        if (!baseutillib.BaseUtilLib.isValidSHA1(this.vcpkgGitCommitId)) {
          throw new Error(`The vcpkg's Git commit id must be a full SHA1 hash (40 hex digits).`);
        }

        if (this.vcpkgGitCommitId === currentCommitId) {
          this.baseUtils.baseLib.info(`Repository is up to date to requested commit id '${this.vcpkgGitCommitId}'`);
          updated = true;
        }
      }
    }

    this.baseUtils.baseLib.info(`Is vcpkg repository updated? ${updated ? "Yes" : "No"}`);
    return updated;
  }

  private checkLastBuildCommitId(vcpkgCommitId: string): boolean {
    this.baseUtils.baseLib.info(`Checking last vcpkg build commit id in file '${this.pathToLastBuiltCommitId}' ...`);
    let rebuild = true;// Default is true.
    const lastCommitIdLast = this.baseUtils.readFile(this.pathToLastBuiltCommitId);
    this.baseUtils.baseLib.debug(`last build check: ${lastCommitIdLast}`);
    if (lastCommitIdLast) {
      this.baseUtils.baseLib.debug(`lastcommitid = ${lastCommitIdLast}, currentcommitid = ${vcpkgCommitId}`);
      if (lastCommitIdLast === vcpkgCommitId) {
        rebuild = false;
        this.baseUtils.baseLib.info(`vcpkg executable is up to date with sources.`);
      } else {
        this.baseUtils.baseLib.info(`vcpkg executable is out of date with sources.`);
      }
    } else {
      rebuild = true; // Force a rebuild.
      this.baseUtils.baseLib.info(`There is no file containing last built commit id of vcpkg, forcing a rebuild.`);
    }

    return rebuild;
  }

  private async cloneRepo(): Promise<void> {
    this.baseUtils.baseLib.debug(`cloneRepo()<<`);

    this.baseUtils.baseLib.info(`Cloning vcpkg in '${this.vcpkgDestPath}'...`);
    if (!this.vcpkgGitCommitId) {
      throw new Error(`When the vcpkg directory is empty, the vcpkg's Git commit id must be provided to git clone the repository.`);
    }
    const gitPath = await this.baseUtils.baseLib.which('git', true);

    await this.baseUtils.baseLib.rmRF(this.vcpkgDestPath);
    await this.baseUtils.baseLib.mkdirP(this.vcpkgDestPath);
    this.baseUtils.baseLib.cd(this.vcpkgDestPath);

    let gitTool = this.baseUtils.baseLib.tool(gitPath);

    gitTool.arg(['clone', this.vcpkgUrl, '-n', '.']);
    this.baseUtils.throwIfErrorCode(await gitTool.exec(this.options));

    gitTool = this.baseUtils.baseLib.tool(gitPath);
    gitTool.arg(['checkout', '--force', this.vcpkgGitCommitId]);
    this.baseUtils.throwIfErrorCode(await gitTool.exec(this.options));
    this.baseUtils.baseLib.info(`Clone vcpkg in '${this.vcpkgDestPath}'.`);
    this.baseUtils.baseLib.debug(`cloneRepo()>>`);
  }

  private async checkExecutable(): Promise<boolean> {
    this.baseUtils.baseLib.debug(`checkExecutable()<<`);

    let needRebuild = false;
    // If the executable file ./vcpkg/vcpkg is not present or it is not wokring, force build. The fact that 'the repository is up to date' is meaningless.
    const vcpkgExePath: string = this.baseUtils.getVcpkgExePath(this.vcpkgDestPath);
    if (!this.baseUtils.fileExists(vcpkgExePath)) {
      this.baseUtils.baseLib.info("Building vcpkg is necessary since its executable is missing.");
      needRebuild = true;
    } else {
      if (!this.baseUtils.isWin32()) {
        await this.baseUtils.baseLib.execSync('chmod', ["+x", vcpkgExePath]);
      }
      this.baseUtils.baseLib.info(`vcpkg executable exists at: '${vcpkgExePath}'.`);
      const result = await this.baseUtils.baseLib.execSync(vcpkgExePath, ['version']);
      if (result.code != 0) {
        needRebuild = true;
        this.baseUtils.baseLib.info(`vcpkg executable returned code ${result.code}, forcing a rebuild.`);
      }
    }

    this.baseUtils.baseLib.debug(`checkExecutable()>> -> ${needRebuild}`);
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
      const cmdPath: string = await this.baseUtils.baseLib.which('cmd.exe', true);
      const cmdTool = this.baseUtils.baseLib.tool(cmdPath);
      cmdTool.arg(['/c', path.join(this.vcpkgDestPath, bootstrapFileName)]);
      this.baseUtils.throwIfErrorCode(await cmdTool.exec(this.options));
    } else {
      const shPath: string = await this.baseUtils.baseLib.which('sh', true);
      const shTool = this.baseUtils.baseLib.tool(shPath);
      const bootstrapFullPath: string = path.join(this.vcpkgDestPath, bootstrapFileName);
      if (!this.baseUtils.isWin32()) {
        await this.baseUtils.baseLib.execSync('chmod', ["+x", bootstrapFullPath]);
      }
      shTool.arg(['-c', bootstrapFullPath]);
      this.baseUtils.throwIfErrorCode(await shTool.exec(this.options));
    }

    // After a build, refetch the commit id of the vcpkg's repo, and store it into the file.
    const builtCommitId = await VcpkgRunner.getCommitId(this.baseUtils, this.vcpkgDestPath);
    this.baseUtils.writeFile(this.pathToLastBuiltCommitId, builtCommitId);
    // Keep track of last successful build commit id.
    this.baseUtils.baseLib.info(`Stored last built vcpkg commit id '${builtCommitId}' in file '${this.pathToLastBuiltCommitId}'.`);
  }
}
