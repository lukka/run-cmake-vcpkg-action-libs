// Copyright (c) 2019-2020 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as path from 'path';
import * as vcpkgUtils from './vcpkg-utils'
import * as ifacelib from "./base-lib";
import * as globals from './vcpkg-globals';

export class VcpkgRunner {
  vcpkgDestPath: string;
  vcpkgArgs: string;
  defaultVcpkgUrl: string;
  vcpkgURL: string;

  /**
   * Git ref (a branch, a tag, or a commit id) to fetch from the vcpkg repository.
   * @type {string} The ref name (e.g. the branch or tag name or id).
   * @memberof VcpkgRunner
   */
  vcpkgCommitId: string;
  vcpkgTriplet: string;
  options: ifacelib.ExecOptions = {} as ifacelib.ExecOptions;
  vcpkgArtifactIgnoreEntries: string[] = [];
  cleanAfterBuild = false;
  doNotUpdateVcpkg = false;

  public constructor(private tl: ifacelib.BaseLib) {
    this.vcpkgArgs = this.tl.getInput(globals.vcpkgArguments, true) ?? "";
    this.defaultVcpkgUrl = 'https://github.com/microsoft/vcpkg.git';
    this.vcpkgURL =
      this.tl.getInput(globals.vcpkgGitURL, false) || this.defaultVcpkgUrl;
    this.vcpkgCommitId =
      this.tl.getInput(globals.vcpkgCommitId, false) || 'master';
    this.vcpkgDestPath = this.tl.getPathInput(globals.vcpkgDirectory, false) ?? "";
    if (!this.vcpkgDestPath) {
      this.vcpkgDestPath = path.join(this.tl.getBinDir(), 'vcpkg');
    }

    this.vcpkgTriplet = this.tl.getInput(globals.vcpkgTriplet, false) || "";
    this.vcpkgArtifactIgnoreEntries = this.tl.getDelimitedInput(globals.vcpkgArtifactIgnoreEntries, '\n', false);

    this.doNotUpdateVcpkg = this.tl.getBoolInput(globals.doNotUpdateVcpkg, false) ?? false;
    this.cleanAfterBuild = this.tl.getBoolInput(globals.cleanAfterBuild, false) ?? false;
  }

  async run(): Promise<void> {
    this.tl.debug("vcpkg runner starting...");
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

    const needRebuild: boolean = await this.updateRepo();
    if (needRebuild) {
      await this.build()
    }

    await this.updatePackages();
    await this.prepareForCache();
  }

  private async prepareForCache(): Promise<void> {
    const artifactignoreFile = '.artifactignore';
    const artifactFullPath: string = path.join(this.vcpkgDestPath, artifactignoreFile);
    const [ok, content]: [boolean, string] = vcpkgUtils.readFile(artifactFullPath);
    const contentWithNewLine = ok ? content + "\n" : "";
    vcpkgUtils.writeFile(artifactFullPath,
      contentWithNewLine + this.vcpkgArtifactIgnoreEntries.join('\n'));
  }

  private async updatePackages(): Promise<void> {
    let vcpkgPath: string = path.join(this.vcpkgDestPath, 'vcpkg');
    if (vcpkgUtils.isWin32()) {
      vcpkgPath += '.exe';
    }

    // vcpkg remove --outdated --recurse
    const removeCmd = 'remove --outdated --recurse';
    let vcpkgTool = this.tl.tool(vcpkgPath);
    console.log(
      `Running 'vcpkg ${removeCmd}' in directory '${this.vcpkgDestPath}' ...`);
    vcpkgTool.line(removeCmd);
    vcpkgUtils.throwIfErrorCode(await vcpkgTool.exec(this.options));

    // vcpkg install --recurse <list of packages>
    vcpkgTool = this.tl.tool(vcpkgPath);
    let installCmd = `install --recurse ${this.vcpkgArgs}`;

    // Extract triplet from arguments for vcpkg.
    const extractedTriplet: string | null = vcpkgUtils.extractTriplet(installCmd, vcpkgUtils.readFile);
    // Append triplet, only if provided by the user in the task arguments
    if (extractedTriplet !== null) {
      if (this.vcpkgTriplet) {
        this.tl.warning(`Ignoring the task provided triplet: '${this.vcpkgTriplet}'.`);
      }
      this.vcpkgTriplet = extractedTriplet;
      console.log(`Extracted triplet from command line '${this.vcpkgTriplet}'.`);
    } else {
      // If triplet is nor specified in arguments, nor in task, let's deduce it from
      // agent context (i.e. its OS).
      if (!this.vcpkgTriplet) {
        console.log("No '--triplet' argument is provided on the command line to vcpkg.");
      } else {
        console.log(`Using triplet '${this.vcpkgTriplet}'.`);

        // Add the triplet argument to the command line.
        installCmd += ` --triplet ${this.vcpkgTriplet}`;
      }
    }

    // If required, add '--clean-after-build'
    if (this.cleanAfterBuild) {
      installCmd += ' --clean-after-build';
    }

    const outVarName = `${globals.outVcpkgTriplet}_OUT`;
    if (this.vcpkgTriplet) {
      // Set the used triplet in RUNVCPKG_VCPKG_TRIPLET environment variable.
      vcpkgUtils.setEnvVar(globals.outVcpkgTriplet, this.vcpkgTriplet);

      // Set output variable containing the use triplet
      console.log(`Set task output variable '${outVarName}' to value: ${
        this.vcpkgTriplet}`);
      this.tl.setVariable(outVarName, this.vcpkgTriplet);
    } else {
      console.log(`${globals.outVcpkgTriplet}' nor '${outVarName}' have NOT been set by the step since there is no default triplet specified.`);
    }

    vcpkgTool.line(installCmd);
    console.log(
      `Running 'vcpkg ${installCmd}' in directory '${this.vcpkgDestPath}' ...`);
    vcpkgUtils.throwIfErrorCode(await vcpkgTool.exec(this.options));
  }

  private async updateRepo(): Promise<boolean> {
    const gitPath: string = await this.tl.which('git', true);
    // Git update or clone depending on content of vcpkgDestPath.
    const cloneCompletedFilePath = path.join(this.vcpkgDestPath, globals.vcpkgRemoteUrlLastFileName);

    // Update the source of vcpkg if needed.
    let updated = false;
    let needRebuild = false;

    if (this.doNotUpdateVcpkg) {
      console.log('Skipping launching git to update vcpkg directory.');
    } else {
      const remoteUrlAndCommitId: string = this.vcpkgURL + this.vcpkgCommitId;
      const isSubmodule = await vcpkgUtils.isVcpkgSubmodule(gitPath, this.vcpkgDestPath);
      if (isSubmodule) {
        // In case vcpkg it is a Git submodule...
        console.log(`'vcpkg' is detected as a submodule, adding '.git' to the ignored entries in '.artifactignore' file (for excluding it from caching).`);
        // Remove any existing '!.git'.
        this.vcpkgArtifactIgnoreEntries =
          this.vcpkgArtifactIgnoreEntries.filter(item => !item.trim().endsWith('!.git'));
        // Add '.git' to ignore that directory.
        this.vcpkgArtifactIgnoreEntries.push('.git');
        console.log(`.artifactsignore content: '${this.vcpkgArtifactIgnoreEntries.map(s => `"${s}"`).join(', ')}'`);
        updated = true;
      }

      const res: boolean = vcpkgUtils.directoryExists(this.vcpkgDestPath);
      this.tl.debug(`exist('${this.vcpkgDestPath}') == ${res}`);
      if (res && !isSubmodule) {
        const [ok, remoteUrlAndCommitIdLast] = vcpkgUtils.readFile(cloneCompletedFilePath);
        this.tl.debug(`cloned check: ${ok}, ${remoteUrlAndCommitIdLast}`);
        if (ok) {
          this.tl.debug(`lastcommitid=${remoteUrlAndCommitIdLast}, actualcommitid=${remoteUrlAndCommitId}`);
          if (remoteUrlAndCommitIdLast == remoteUrlAndCommitId) {
            // Update from remote repository.
            this.tl.debug(`options.cwd=${this.options.cwd}`);
            vcpkgUtils.throwIfErrorCode(await this.tl.exec(gitPath, ['remote', 'update'], this.options));
            // Use git status to understand if we need to rebuild vcpkg since the last cloned 
            // repository is not up to date.
            const gitRunner: ifacelib.ToolRunner = this.tl.tool(gitPath);
            gitRunner.arg(['status', '-uno']);
            const res: ifacelib.ExecResult = await gitRunner.execSync(this.options);
            const uptodate = res.stdout.match("up to date");
            const detached = res.stdout.match("detached");
            if (!uptodate && !detached) {
              // Update sources and force a rebuild.
              vcpkgUtils.throwIfErrorCode(await this.tl.exec(gitPath, ['pull', 'origin', this.vcpkgCommitId], this.options));
              needRebuild = true;
              console.log("Building vcpkg as Git repo has been updated.");
            }
            updated = true;
          }
        }
      }

      // Git clone.
      if (!updated) {
        needRebuild = true;
        await this.tl.rmRF(this.vcpkgDestPath);
        await this.tl.mkdirP(this.vcpkgDestPath);
        this.tl.cd(this.vcpkgDestPath);

        let gitTool = this.tl.tool(gitPath);

        gitTool.arg(['clone', this.vcpkgURL, '-n', '.']);
        vcpkgUtils.throwIfErrorCode(await gitTool.exec(this.options));

        gitTool = this.tl.tool(gitPath);
        gitTool.arg(['checkout', '--force', this.vcpkgCommitId]);
        vcpkgUtils.throwIfErrorCode(await gitTool.exec(this.options));

        this.tl.writeFile(cloneCompletedFilePath, remoteUrlAndCommitId);
      }
    }

    // If the executable file ./vcpkg/vcpkg is not present, force build. The fact that 'the repository is up to date' is meaningless.
    const vcpkgExePath: string = vcpkgUtils.getVcpkgExePath(this.vcpkgDestPath);
    if (!vcpkgUtils.fileExists(vcpkgExePath)) {
      console.log("Building vcpkg as executable is missing.");
      needRebuild = true;
    } else {
      if (!vcpkgUtils.isWin32()) {
        await this.tl.execSync('chmod', ["+x", vcpkgExePath])
      }

      if (!await this.executableUpToDate(vcpkgExePath)) {
        needRebuild = true;
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
  }

  private async executableUpToDate(vcpkgExePath: string): Promise<boolean> {
    let upToDate = false;
    this.tl.debug("executableUpToDate()<<");
    try {
      const options: ifacelib.ExecOptions = {
        cwd: vcpkgExePath,
        failOnStdErr: false,
        errStream: process.stdout,
        outStream: process.stdout,
        ignoreReturnCode: true,
        silent: false,
        windowsVerbatimArguments: false,
        env: process.env
      } as ifacelib.ExecOptions;

      const res: ifacelib.ExecResult = await this.tl.execSync(
        vcpkgExePath, ['version'], options);
      let msg: string;
      const nil = "<null>";
      msg = `\n'vcpkg version': exit code='${res.code ?? -1000}' \n`;
      msg += `'vcpkg version': stdout='${res.stdout ?? nil}' \n`;
      const vcpkgVersion = res.stdout ?? "<nil-stdout>";
      msg += `'vcpkg version': stderr='${res.stderr ?? nil}' \n`;
      const [ok, content] = vcpkgUtils.readFile(
        path.join(vcpkgExePath, 'toolsrc', 'VERSION.txt'));
      msg += `'VERSION.txt: '${ok}', '${content?.toString() ?? nil}' \n`;

      if (ok && content) {
        const trimmedContent = content.toString().replace("\"", "");
        const trimmedVersion = vcpkgVersion.replace("\"", "");
        this.tl.debug(`trimmedContent='${trimmedContent}`);
        this.tl.debug(`trimmedVersion='${trimmedVersion}'`);
        if (trimmedContent.includes(trimmedVersion)) {
          upToDate = true;
        }
      }

    }
    catch (error) {
      this.tl.warning(error);
      console.log(error);
    }

    if (upToDate) {
      console.log("vcpkg executable is up-to-date with sources.");
    }
    else {
      console.log("vcpkg executable is not up-to-date with sources.");
    }
    return upToDate;
  }

}
