// Copyright (c) 2019-2020 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as path from 'path';
import * as vcpkgUtils from './vcpkg-utils'
import * as ifacelib from "./base-lib";
import * as globals from './vcpkg-globals';

export class VcpkgRunner {
  private readonly vcpkgDestPath: string;
  private readonly vcpkgArgs: string;
  private readonly defaultVcpkgUrl: string;
  private readonly vcpkgURL: string;
  private readonly setupOnly: boolean;

  /**
   * Git commit id to fetch from the vcpkg repository.
   * @type {string} The ref name (e.g. the branch or tag name or id).
   * @memberof VcpkgRunner
   */
  readonly vcpkgCommitId?: string;
  readonly vcpkgTriplet: string;
  readonly options: ifacelib.ExecOptions = {} as ifacelib.ExecOptions;
  vcpkgArtifactIgnoreEntries: string[] = [];
  readonly cleanAfterBuild: boolean = false;
  readonly doNotUpdateVcpkg: boolean = false;
  readonly pathToLastBuiltCommitId: string;
  private static readonly overlayArgName = "--overlay-ports=";

  public constructor(private tl: ifacelib.BaseLib) {
    this.setupOnly = this.tl.getBoolInput(globals.setupOnly, false) ?? false;

    this.vcpkgArgs = this.tl.getInput(globals.vcpkgArguments, this.setupOnly === false) ?? "";
    this.defaultVcpkgUrl = 'https://github.com/microsoft/vcpkg.git';
    this.vcpkgURL =
      this.tl.getInput(globals.vcpkgGitURL, false) || this.defaultVcpkgUrl;
    this.vcpkgCommitId =
      this.tl.getInput(globals.vcpkgCommitId, false);
    this.vcpkgDestPath = this.tl.getPathInput(globals.vcpkgDirectory, false, false) ?? "";
    if (!this.vcpkgDestPath) {
      this.vcpkgDestPath = path.join(this.tl.getBinDir(), 'vcpkg');
    }

    this.vcpkgTriplet = this.tl.getInput(globals.vcpkgTriplet, false) || "";
    this.vcpkgArtifactIgnoreEntries = this.tl.getDelimitedInput(globals.vcpkgArtifactIgnoreEntries, '\n', false);

    this.doNotUpdateVcpkg = this.tl.getBoolInput(globals.doNotUpdateVcpkg, false) ?? false;
    this.cleanAfterBuild = this.tl.getBoolInput(globals.cleanAfterBuild, false) ?? true;

    // Git update or clone depending on content of vcpkgDestPath input parameter.
    this.pathToLastBuiltCommitId = path.join(this.vcpkgDestPath, globals.vcpkgLastBuiltCommitId);

    this.options = {
      cwd: this.vcpkgDestPath,
      failOnStdErr: false,
      errStream: process.stdout,
      outStream: process.stdout,
      ignoreReturnCode: true,
      silent: false,
      windowsVerbatimArguments: false,
      env: process.env
    } as ifacelib.ExecOptions;
  }

  async run(): Promise<void> {
    this.tl.debug("vcpkg runner starting...");

    vcpkgUtils.wrapOpSync("Set output env vars", () => this.setOutputs());

    // Ensuring `this.vcpkgDestPath` is existent, since is going to be used as current working directory.
    if (!await this.tl.exist(this.vcpkgDestPath)) {
      this.tl.debug(`Creating vcpkg root directory as it is not existing: ${this.vcpkgDestPath}`);
      await this.tl.mkdirP(this.vcpkgDestPath);
    }

    let needRebuild = false;
    const currentCommitId = await this.getCommitId();
    if (this.doNotUpdateVcpkg) {
      console.log(`Skipping any check to update vcpkg directory (${this.vcpkgDestPath}).`);
    } else {
      const updated = await vcpkgUtils.wrapOp("Check whether vcpkg repository is up to date",
        () => this.checkRepoUpdated(currentCommitId),
      );
      if (!updated) {
        await vcpkgUtils.wrapOp("Download vcpkg source code repository",
          () => this.cloneRepo());
        needRebuild = true;
      }
    }

    // Build is needed at the first check which is saying so.
    if (!needRebuild) {
      needRebuild = vcpkgUtils.wrapOpSync("Check whether last vcpkg's build is up to date with sources", () => this.checkLastBuildCommitId(currentCommitId));
      if (!needRebuild) {
        needRebuild = await vcpkgUtils.wrapOp("Check vcpkg executable exists", () => this.checkExecutable());
      }
    }

    if (needRebuild) {
      await vcpkgUtils.wrapOp("Build vcpkg", () => this.build());
    }

    if (!this.setupOnly) {
      await vcpkgUtils.wrapOp("Install/Update ports", () => this.updatePackages());
    }

    await vcpkgUtils.wrapOp("Prepare vcpkg generated file for caching", () => this.prepareForCache());
  }

  private setOutputs(): void {
    // Set the RUNVCPKG_VCPKG_ROOT value, it could be re-used later by run-cmake task.
    vcpkgUtils.setEnvVar(globals.outVcpkgRootPath, this.vcpkgDestPath);
    // Override the VCPKG_ROOT value, it must point to this vcpkg instance, it is used by 
    // any invocation of the vcpkg executable in this task.
    vcpkgUtils.setEnvVar(globals.vcpkgRoot, this.vcpkgDestPath);

    // The output variable must have a different name than the
    // one set with setVariable(), as the former get a prefix added out of our control.
    const outVarName = `${globals.outVcpkgRootPath}_OUT`;
    console.log(`Set task output variable '${outVarName}' to value: ${
      this.vcpkgDestPath}`);
    this.tl.setOutput(`${outVarName}`, this.vcpkgDestPath);

    // Force AZP_CACHING_CONTENT_FORMAT to "Files"
    vcpkgUtils.setEnvVar(vcpkgUtils.cachingFormatEnvName, "Files");
  }

  private async prepareForCache(): Promise<void> {
    const artifactignoreFile = '.artifactignore';
    const artifactFullPath: string = path.join(this.vcpkgDestPath, artifactignoreFile);
    vcpkgUtils.writeFile(artifactFullPath,
      this.vcpkgArtifactIgnoreEntries.join('\n'));
  }

  private static extractOverlays(args: string, currentDir: string): string[] {
    const overlays: string[] = args.split(' ').
      filter((item) => item.startsWith(VcpkgRunner.overlayArgName) || item.startsWith('@'));

    let result: string[] = [];
    for (const item of overlays) {
      if (item.startsWith('@')) {
        let responseFilePath = item.slice(1);
        if (!path.isAbsolute(responseFilePath)) {
          responseFilePath = path.join(currentDir, responseFilePath);
        }

        const [ok, content] = vcpkgUtils.readFile(responseFilePath)
        if (ok) {
          const overlays2: string[] = content.split('\n').
            filter((item) => item.trim().startsWith(VcpkgRunner.overlayArgName)).map((item) => item.trim());
          result = result.concat(overlays2);
        }
      } else {
        result = result.concat(item);
      }
    }

    return result;
  }

  private async updatePackages(): Promise<void> {
    let vcpkgPath: string = path.join(this.vcpkgDestPath, 'vcpkg');
    if (vcpkgUtils.isWin32()) {
      vcpkgPath += '.exe';
    }

    const appendedOverlaysArgs: string[] = VcpkgRunner.extractOverlays(this.vcpkgArgs, this.options.cwd);
    const appendedString = appendedOverlaysArgs ? " " + appendedOverlaysArgs.join(' ') : "";
    // vcpkg remove --outdated --recurse
    const removeCmd = `remove --outdated --recurse${appendedString}`;
    let vcpkgTool = this.tl.tool(vcpkgPath);
    console.log(
      `Running 'vcpkg ${removeCmd}' in directory '${this.vcpkgDestPath}' ...`);
    vcpkgTool.line(removeCmd);
    vcpkgUtils.throwIfErrorCode(await vcpkgTool.exec(this.options));

    // vcpkg install --recurse <list of packages>
    vcpkgTool = this.tl.tool(vcpkgPath);
    let installCmd = `install --recurse ${this.vcpkgArgs}`;

    // Get the triplet specified in the task.
    let vcpkgTripletUsed = this.vcpkgTriplet;
    // Extract triplet from arguments for vcpkg.
    const extractedTriplet: string | null = vcpkgUtils.extractTriplet(installCmd, vcpkgUtils.readFile);
    // Append triplet, only if provided by the user in the task arguments
    if (extractedTriplet !== null) {
      if (vcpkgTripletUsed) {
        this.tl.warning(`Ignoring the task provided triplet: '${vcpkgTripletUsed}'.`);
      }
      vcpkgTripletUsed = extractedTriplet;
      console.log(`Extracted triplet from command line '${vcpkgTripletUsed}'.`);
    } else {
      // If triplet is nor specified in arguments, nor in task, let's deduce it from
      // agent context (i.e. its OS).
      if (!vcpkgTripletUsed) {
        console.log("No '--triplet' argument is provided on the command line to vcpkg.");
      } else {
        console.log(`Using triplet '${vcpkgTripletUsed}'.`);

        // Add the triplet argument to the command line.
        installCmd += ` --triplet ${vcpkgTripletUsed}`;
      }
    }

    // If required, add '--clean-after-build'
    if (this.cleanAfterBuild) {
      installCmd += ' --clean-after-build';
    }

    const outVarName = `${globals.outVcpkgTriplet}_OUT`;
    if (vcpkgTripletUsed) {
      // Set the used triplet in RUNVCPKG_VCPKG_TRIPLET environment variable.
      vcpkgUtils.setEnvVar(globals.outVcpkgTriplet, vcpkgTripletUsed);

      // Set output variable containing the use triplet
      console.log(`Set task output variable '${outVarName}' to value: ${
        vcpkgTripletUsed}`);
      this.tl.setVariable(outVarName, vcpkgTripletUsed);
    } else {
      console.log(`${globals.outVcpkgTriplet}' nor '${outVarName}' have NOT been set by the step since there is no default triplet specified.`);
    }

    vcpkgTool.line(installCmd);
    console.log(
      `Running 'vcpkg ${installCmd}' in directory '${this.vcpkgDestPath}' ...`);
    vcpkgUtils.throwIfErrorCode(await vcpkgTool.exec(this.options));
  }

  /**
   * Get the commit id of the vcpkg directory specified in 'vcpkgDirectory' input.
   * @private
   * @returns {Promise<string>} the commit id
   * @memberof VcpkgRunner
   */
  private async getCommitId(): Promise<string> {
    this.tl.debug("getCommitId()<<");
    let currentCommitId = "";
    const gitPath = await this.tl.which('git', true);
    // Use git to verify whether the repo is up to date.
    const gitRunner: ifacelib.ToolRunner = this.tl.tool(gitPath);
    gitRunner.arg(['rev-parse', 'HEAD']);
    console.log(`Fetching the commit id at ${this.options.cwd}`);
    const res: ifacelib.ExecResult = await gitRunner.execSync(this.options);
    if (res.code === 0) {
      currentCommitId = vcpkgUtils.trimString(res.stdout);
      this.tl.debug(`git rev-parse: code=${res.code}, stdout=${vcpkgUtils.trimString(res.stdout)}, stderr=${vcpkgUtils.trimString(res.stderr)}`);
    } else /* if (res.code !== 0) */ {
      this.tl.debug(`error executing git: code=${res.code}, stdout=${vcpkgUtils.trimString(res.stdout)}, stderr=${vcpkgUtils.trimString(res.stderr)}`);
    }
    this.tl.debug(`getCommitId()>> -> ${currentCommitId}`);
    return currentCommitId;
  }

  private async checkRepoUpdated(currentCommitId: string): Promise<boolean> {
    console.log(`Checking whether vcpkg's repository is updated to commit id '${currentCommitId}' ...`);
    let updated = false;

    const gitPath = await this.tl.which('git', true);
    const isSubmodule = await vcpkgUtils.isVcpkgSubmodule(gitPath, this.vcpkgDestPath);
    if (isSubmodule) {
      // In case vcpkg it is a Git submodule...
      console.log(`'vcpkg' is detected as a submodule, adding '.git' to the ignored entries in '.artifactignore' file (for excluding it from caching).`);
      // Remove any existing '!.git'.
      this.vcpkgArtifactIgnoreEntries =
        this.vcpkgArtifactIgnoreEntries.filter(item => !item.trim().endsWith('!.git'));
      // Add '.git' to ignore that directory.
      this.vcpkgArtifactIgnoreEntries.push('.git');
      console.log(`File '.artifactsignore' content: '${this.vcpkgArtifactIgnoreEntries.map(s => `'${s}'`).join(', ')}'`);
      updated = true;

      // Issue a warning if the vcpkgCommitId is specified.
      if (this.vcpkgCommitId) {
        this.tl.warning(`Since the vcpkg directory '${this.vcpkgDestPath}' is a submodule, the input '${globals.vcpkgCommitId}' should not be provided (${this.vcpkgCommitId})`);
      }
    } else {
      const res: boolean = vcpkgUtils.directoryExists(this.vcpkgDestPath);
      this.tl.debug(`exist('${this.vcpkgDestPath}') === ${res}`);
      if (res && !isSubmodule) {

        // Use git to verify whether the repo is up to date.
        console.log(`Current commit id of vcpkg: '${currentCommitId}'.`);
        if (!this.vcpkgCommitId) {
          throw new Error(`'${globals.vcpkgCommitId}' input parameter must be provided when the specified vcpkg directory (${this.vcpkgDestPath}) is not a submodule.`);
        }
        if (this.vcpkgCommitId === currentCommitId) {
          console.log(`Repository is up to date to requested commit id '${this.vcpkgCommitId}'`);
          updated = true;
        }
      }
    }

    console.log(`Is vcpkg repository updated? ${updated ? "Yes" : "No"}`);
    return updated;
  }

  private checkLastBuildCommitId(vcpkgCommitId: string): boolean {
    console.log(`Checking last vcpkg build commit id in file '${this.pathToLastBuiltCommitId}' ...`);
    let rebuild = true;// Default is true.
    const [ok, lastCommitIdLast] = vcpkgUtils.readFile(this.pathToLastBuiltCommitId);
    this.tl.debug(`last build check: ${ok}, ${lastCommitIdLast}`);
    if (ok) {
      this.tl.debug(`lastcommitid = ${lastCommitIdLast}, currentcommitid = ${vcpkgCommitId}`);
      if (lastCommitIdLast === vcpkgCommitId) {
        rebuild = false;
        console.log(`vcpkg executable is up to date with sources.`);
      } else {
        console.log(`vcpkg executable is out of date with sources.`);
      }
    } else {
      rebuild = true; // Force a rebuild.
      console.log(`There is no file containing last built commit id of vcpkg, forcing a rebuild.`);
    }

    return rebuild;
  }

  private async cloneRepo(): Promise<void> {
    console.log(`Cloning vcpkg in '${this.vcpkgDestPath}'...`);
    if (!this.vcpkgCommitId) {
      throw new Error(`When the vcpkg directory is empty, the input parameter '${globals.vcpkgCommitId}' must be provided to git clone the repository.`);
    }
    const gitPath = await this.tl.which('git', true);

    await this.tl.rmRF(this.vcpkgDestPath);
    await this.tl.mkdirP(this.vcpkgDestPath);
    this.tl.cd(this.vcpkgDestPath);

    let gitTool = this.tl.tool(gitPath);

    gitTool.arg(['clone', this.vcpkgURL, '-n', '.']);
    vcpkgUtils.throwIfErrorCode(await gitTool.exec(this.options));

    gitTool = this.tl.tool(gitPath);
    gitTool.arg(['checkout', '--force', this.vcpkgCommitId]);
    vcpkgUtils.throwIfErrorCode(await gitTool.exec(this.options));
    console.log(`Clone vcpkg in '${this.vcpkgDestPath}'.`);
  }

  private async checkExecutable(): Promise<boolean> {
    let needRebuild = false;
    // If the executable file ./vcpkg/vcpkg is not present, force build. The fact that 'the repository is up to date' is meaningless.
    const vcpkgExePath: string = vcpkgUtils.getVcpkgExePath(this.vcpkgDestPath);
    if (!vcpkgUtils.fileExists(vcpkgExePath)) {
      console.log("Building vcpkg is necessary as executable is missing.");
      needRebuild = true;
    } else {
      if (!vcpkgUtils.isWin32()) {
        await this.tl.execSync('chmod', ["+x", vcpkgExePath])
      }
    }
    return needRebuild;
  }

  private async build(): Promise<void> {
    // Build vcpkg.
    let bootstrapFileName = 'bootstrap-vcpkg';
    if (vcpkgUtils.isWin32()) {
      bootstrapFileName += '.bat';
    } else {
      bootstrapFileName += '.sh';
    }

    if (vcpkgUtils.isWin32()) {
      const cmdPath: string = await this.tl.which('cmd.exe', true);
      const cmdTool = this.tl.tool(cmdPath);
      cmdTool.arg(['/c', path.join(this.vcpkgDestPath, bootstrapFileName)]);
      vcpkgUtils.throwIfErrorCode(await cmdTool.exec(this.options));
    } else {
      const shPath: string = await this.tl.which('sh', true);
      const shTool = this.tl.tool(shPath);
      const bootstrapFullPath: string = path.join(this.vcpkgDestPath, bootstrapFileName);
      if (!vcpkgUtils.isWin32()) {
        await this.tl.execSync('chmod', ["+x", bootstrapFullPath]);
      }
      shTool.arg(['-c', bootstrapFullPath]);
      vcpkgUtils.throwIfErrorCode(await shTool.exec(this.options));
    }

    // After a build, refetch the commit id of the vcpkg's repo, and store it into the file.
    const builtCommitId = await this.getCommitId();
    vcpkgUtils.writeFile(this.pathToLastBuiltCommitId, builtCommitId);
    // Keep track of last successful build commit id.
    console.log(`Stored last built vcpkg commit id '${builtCommitId}' in file '${this.pathToLastBuiltCommitId}`);

  }

}
