// Copyright (c) 2019-2020 Luca Cappa
// Released under the term specified in file LICENSE.txt
// SPDX short identifier: MIT

import * as baselib from '@lukka/base-lib';
import * as utils from '@lukka/base-lib/src/utils'
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import 'strip-json-comments';
import * as ninjalib from './ninja';
import * as globals from './cmake-globals'
import * as cmakerunner from './cmake-runner'
import * as cmakeutil from './utils'
import { using } from "using-statement";
import stripJsonComments from 'strip-json-comments';

export interface EnvironmentMap { [name: string]: Environment }

class CMakeGenerators {
  static readonly ARM64: [string, string] = ["ARM64", "ARM64"];
  static readonly ARM: [string, string] = ["ARM", "ARM"];
  static readonly X64: [string, string] = ["x64", "x64"];
  static readonly WIN64: [string, string] = ["Win64", "x64"];
  static readonly WIN32: [string, string] = ["Win32", "Win32"];
}

class CMakeVariable {
  constructor(
    public readonly name: string,
    public readonly value: string,
    public readonly type?: string) {
    if (!type) {
      this.type = 'string';
    }
    console.log(`Defining CMake variable: [name:'${name}', value='${value}', type='${type}'].`);
  }

  public toString(): string {
    return `-D${this.name}:${this.type}=${this.value}`;
  }
}

class Variable {
  constructor(
    public readonly name: string,
    public readonly value: string) {
    // Nothing to do here.
  }

  public toString(): string {
    return `{var: '${this.name}'='${this.value}'}`;
  }

  public addToEnvironment(): void {
    process.env[this.stripNamespace(this.name)] = this.value;
  }

  private stripNamespace(varName: string): string {
    return varName.substring(varName.indexOf('.') + 1);
  }
}

export class Environment {
  constructor(
    public readonly name: string,
    private theVariables: Variable[]) {
    // Nothing to do.
  }

  public addVariable(variable: Variable): void {
    this.theVariables.push(variable);
  }

  public get variables(): readonly Variable[] {
    return this.theVariables;
  }

  public toString(): string {
    let varsString = "";
    for (const variable of this.theVariables) {
      varsString += String(variable) + ", ";
    }
    return `{env: '${this.name}', variables=${varsString}}`;
  }
}

export class Configuration {

  // Internal placeholder name for environment without a name
  static readonly unnamedEnvironmentName = 'unnamed';

  constructor(
    public readonly name: string,
    public readonly environments: EnvironmentMap,
    public /* readonly //?? */ buildDir: string,
    public readonly cmakeArgs: string,
    public readonly makeArgs: string,
    public readonly generator: string,
    public readonly type: string,
    public readonly workspaceRoot: string,
    public readonly cmakeSettingsJsonPath: string,
    public readonly cmakeToolchain: string,
    public readonly variables: readonly CMakeVariable[],
    public readonly inheritEnvironments: readonly string[]) {
  }

  /**
   * Add to current process the environment variables defined in this configuration.
   *
   * @param {EnvironmentMap} globalEnvs The global environments (not defined in this configuration)
   * @memberof Configuration
   */
  public setEnvironment(globalEnvs: EnvironmentMap): void {
    // Set all 'env' and unnamed environments and inherited environments.
    for (const envName in globalEnvs) {
      const environment: Environment = globalEnvs[envName];
      const nameLowerCased = environment.name.toLowerCase();
      // Unnamed environments (i.e. with no 'environment' property specified),
      // empty string named (e.g. {"environment": "", ...} ), or ones called 'env' 
      // are being set in the environment automatically. All others needs to be 
      // explicitly inherited.
      if (!nameLowerCased || "env" === nameLowerCased ||
        Configuration.unnamedEnvironmentName === nameLowerCased) {
        for (const variable of environment.variables) {
          variable.addToEnvironment();
        }
      }
    }

    // Set all inherited environments.
    for (const envName of this.inheritEnvironments) {
      const environment = globalEnvs[envName];
      if (environment) {
        for (const variable of environment.variables) {
          variable.addToEnvironment();
        }
      }
    }

    // Set all 'env' and unnamed environments.
    for (const env in this.environments) {
      for (const variable of this.environments[env].variables) {
        variable.addToEnvironment();
      }
    }
  }

  public evaluate(evaluator: PropertyEvaluator): Configuration {
    const evaledVars: CMakeVariable[] = [];
    for (const variable of this.variables) {
      evaledVars.push(new CMakeVariable(variable.name, evaluator.evaluateExpression(variable.value), variable.type));
    }

    const conf: Configuration = new Configuration(this.name,
      this.environments,
      evaluator.evaluateExpression(this.buildDir),
      evaluator.evaluateExpression(this.cmakeArgs),
      evaluator.evaluateExpression(this.makeArgs),
      evaluator.evaluateExpression(this.generator),
      evaluator.evaluateExpression(this.type),
      this.workspaceRoot,
      this.cmakeSettingsJsonPath,
      evaluator.evaluateExpression(this.cmakeToolchain),
      evaledVars,
      this.inheritEnvironments
    );

    return conf;
  }

  public getGeneratorBuildArgs(): string {
    let generatorBuildArgs = "";
    if (this.generator.includes("Visual Studio")) {
      generatorBuildArgs = `--config ${this.type}`;
    }
    else if (this.generator.includes("Ninja Multi-Config")) {
      generatorBuildArgs = `--config ${this.type}`;
    }

    return generatorBuildArgs;
  }

  public getGeneratorArgs(): (string | undefined)[] {
    let gen: string = this.generator;
    let arch: string | undefined;
    if (gen.includes("Visual Studio")) {
      // for VS generators, add the -A value
      let architectureParam: string | undefined = undefined;

      const architectures: [string, string][] = [
        CMakeGenerators.X64,
        CMakeGenerators.WIN32,
        CMakeGenerators.WIN64,
        CMakeGenerators.ARM64, // Note ARM64 must be replaced before ARM!
        CMakeGenerators.ARM
      ];

      // Remove the platform
      for (const architecture of architectures) {
        if (gen.includes(architecture[0])) {
          gen = gen.replace(architecture[0], "");
          architectureParam = architecture[1];
        }
      }

      gen = `-G${gen.trim()}`;

      if (architectureParam) {
        arch = `-A${architectureParam.trim()}`
      }
    } else {
      // All non-VS generators are passed as is.
      gen = `-G${gen.trim()}`;
    }

    return [gen, arch];
  }

  public toString(): string {
    return `{conf: ${this.name}:${this.type}}`;
  }
}

export class PropertyEvaluator {
  // Matches the variable name in "${variable.name}".
  private varExp = new RegExp("\\$\{([^\{\}]+)\}", "g");
  private localEnv: Environment = new Environment("", []);

  public constructor(
    public config: Configuration,
    public globalEnvs: EnvironmentMap,
    private tl: baselib.BaseLib) {
    this.createLocalVars();
  }

  private addToLocalEnv(name: string, value: string): void {
    this.localEnv.addVariable(new Variable(name, value));
  }

  private createLocalVars(): void {
    const settingsPath: string = this.config.cmakeSettingsJsonPath;

    this.addToLocalEnv('name', this.config.name);
    this.addToLocalEnv('generator', this.config.generator);
    this.addToLocalEnv('workspaceRoot', this.config.workspaceRoot);
    this.addToLocalEnv('thisFile', settingsPath);
    this.addToLocalEnv(
      'projectFile',
      path.join(
        path.dirname(settingsPath), 'CMakeLists.txt'));
    this.addToLocalEnv(
      'projectDir', path.dirname(settingsPath));
    this.addToLocalEnv(
      'projectDirName', path.basename(path.dirname(settingsPath)));
    this.addToLocalEnv(
      'workspaceHash',
      crypto.createHash('md5')
        .update(this.config.cmakeSettingsJsonPath)
        .digest('hex'));
  }

  private searchVariable(variable: string, env: Environment): string | null {
    if (env != null) {
      for (const v of env.variables) {
        if (v.name === variable) {
          return v.value ?? "";
        }
      }
    }
    return null;
  }

  private evaluateVariable(variable: Variable): string | null {
    this.tl.debug(`Searching ${variable.name} in environment ${this.localEnv} ...`);
    let res = this.searchVariable(variable.name, this.localEnv);
    if (res !== null) {
      return res;
    }

    for (const localName of this.config.inheritEnvironments) {
      const env = this.config.environments[localName];
      res = this.searchVariable(variable.name, env);
      if (res !== null) {
        return res;
      }
    }

    let env = this.config.environments[Configuration.unnamedEnvironmentName];
    res = this.searchVariable(variable.name, env);
    if (res !== null) {
      return res;
    }

    for (const localName of this.config.inheritEnvironments) {
      const env = this.globalEnvs[localName];
      res = this.searchVariable(variable.name, env);
      if (res !== null)
        return res;
    }

    env = this.globalEnvs[Configuration.unnamedEnvironmentName];
    res = this.searchVariable(variable.name, env);
    if (res !== null)
      return res;

    // Try to match an environment variable.
    if (variable.name.startsWith("env.")) {
      const envVarName: string = variable.name.substring(4);
      const value = process.env[envVarName];
      if (value) {
        return value;
      }
    }
    return null;
  }

  private extractVariables(str: string): Variable[] | null {
    const variables: Variable[] = [];
    while (true) {
      const match = this.varExp.exec(str);
      if (match === null) break;
      if (match.length > 1) {
        const varname = match[1];
        const variable: Variable =
          new Variable(varname, '');
        variables.push(variable);
      }
    }

    return variables;
  }

  public evaluateExpression(expr: string): string {
    this.tl.debug(`evaluating expression: '${expr}' ...`)
    let res: string = expr;
    while (true) {
      const variables = this.extractVariables(res);
      if (variables !== null) {
        let resolved: boolean;
        resolved = false;
        for (const variable of variables) {
          const resv = this.evaluateVariable(variable);
          if (resv !== null) {
            res = res.replace('${' + variable.name + '}', resv);
            this.tl.debug(`evaluated \$\{${variable.name}\} to '${resv}'`);
            resolved = true;
          } else {
            this.tl.debug(`Warning: could not evaluate '${variable.toString()}'`)
          }
        }

        if (resolved === false) {
          break;
        }
      }
    }

    this.tl.debug(`evalutated to: '${String(res)}'.`);
    return res ?? '';
  }
}

export function parseEnvironments(envsJson: any): EnvironmentMap {
  const environments: EnvironmentMap = {};
  for (const env of envsJson) {
    let namespace = 'env';
    let name = Configuration.unnamedEnvironmentName;
    const variables: Variable[] = [];
    for (const envi in env) {
      if (envi === 'environment') {
        name = env[envi];
      } else if (envi === 'namespace') {
        namespace = env[envi];
      } else {
        let variableName = envi;
        const variableValue = env[envi];
        if (!variableName.includes('.')) {
          if (namespace && namespace.length > 0) {
            variableName = namespace + '.' + variableName;
          }
        }

        variables.push(new Variable(variableName, variableValue));
      }
    }

    if (name in environments) {
      // Append entries to existing environments' variables.
      for (const variable of variables) {
        environments[name].addVariable(variable);
      }
    } else {
      // Create a new environment.
      const env: Environment = new Environment(name, variables);
      environments[name] = env;
    }
  }

  return environments;
}

export function parseConfigurations(configurationsJson: any, cmakeSettingsJson: string, sourceDir: string): Configuration[] {
  // Parse all configurations.
  const configurations: Configuration[] = [];
  for (const configuration of configurationsJson) {
    // Parse variables.
    const vars: CMakeVariable[] = [];
    if (configuration.variables) {
      for (const variable of configuration.variables) {
        const data: CMakeVariable =
          new CMakeVariable(variable.name, variable.value, variable.type);
        vars.push(data);
      };
    }

    // Parse inherited environments.
    const inheritedEnvs: string[] = [];
    if (configuration.inheritEnvironments) {
      for (const env of configuration.inheritEnvironments) {
        inheritedEnvs.push(env);
      }
    }

    // Parse local environments.
    let localEnvs: EnvironmentMap = {};
    if (configuration.environments) {
      localEnvs = parseEnvironments(configuration.environments);
    }

    const newConfiguration: Configuration = new Configuration(
      configuration.name,
      localEnvs,
      configuration.remoteMachineName ? configuration.remoteBuildRoot : configuration.buildRoot,
      configuration.cmakeCommandArgs,
      configuration.buildCommandArgs,
      configuration.generator,
      configuration.configurationType,
      // Set the workspace with the provided source directory.
      sourceDir,
      // Set the Configuration.cmakeSettingsJsonPath field value with the one passed in.
      cmakeSettingsJson,
      configuration.cmakeToolchain,
      vars,
      inheritedEnvs);

    configurations.push(newConfiguration);
  } //for

  return configurations;
}

export class CMakeSettingsJsonRunner {
  private readonly baseUtils: baselib.BaseLibUtils;
  private readonly cmakeUtils: cmakeutil.CMakeUtils;
  private readonly ninjaLib: ninjalib.NinjaDownloader;

  constructor(
    private readonly baseLib: baselib.BaseLib,
    private readonly cmakeSettingsJson: string,
    private readonly configurationFilter: string,
    private readonly appendedCMakeArgs: string,
    private readonly workspaceRoot: string,
    private readonly vcpkgTriplet: string,
    private readonly useVcpkgToolchain: boolean,
    private readonly doBuild: boolean,
    private readonly ninjaPath: string,
    private readonly ninjaDownloadUrl: string,
    private readonly sourceScript: string,
    private readonly buildDir: string,
    private readonly tl: baselib.BaseLib) {
    this.configurationFilter = configurationFilter;

    this.baseUtils = new baselib.BaseLibUtils(this.baseLib);
    this.cmakeUtils = new cmakeutil.CMakeUtils(this.baseUtils);
    this.ninjaLib = new ninjalib.NinjaDownloader(this.tl);

    this.buildDir = path.normalize(this.baseUtils.resolvePath(this.buildDir));
    if (!fs.existsSync(cmakeSettingsJson)) {
      throw new Error(`File '${cmakeSettingsJson}' does not exist.`);
    }
  }

  private parseConfigurations(json: any): Configuration[] {
    let configurations: Configuration[] = [];
    if (json.configurations) {
      configurations = parseConfigurations(json.configurations, this.cmakeSettingsJson,
        this.tl.getSrcDir());
    }
    this.tl.debug(`CMakeSettings.json parsed configurations: '${String(configurations)}'.`);

    return configurations;
  }

  private static parseEnvironments(envsJson: any): EnvironmentMap {
    return parseEnvironments(envsJson);
  }

  parseGlobalEnvironments(json: any): EnvironmentMap {
    // Parse global environments
    let globalEnvs: EnvironmentMap = {};
    if (json.environments != null) {
      globalEnvs = CMakeSettingsJsonRunner.parseEnvironments(json.environments);
    }
    this.tl.debug("CMakeSettings.json parsed global environments.");
    for (const envName in globalEnvs) {
      this.tl.debug(`'${envName}'=${String(globalEnvs[envName])}`);
    }

    return globalEnvs;
  }

  async run(): Promise<void> {
    let content: any = fs.readFileSync(this.cmakeSettingsJson);
    // Remove any potential BOM at the beginning.
    content = content.toString().trimLeft();
    this.tl.debug(`Content of file CMakeSettings.json: '${content}'.`);
    // Strip any comment out of the JSON content.
    const cmakeSettingsJson: any = JSON.parse(stripJsonComments(content));

    const configurations = this.parseConfigurations(cmakeSettingsJson);
    const globalEnvs = this.parseGlobalEnvironments(cmakeSettingsJson);

    const regex = new RegExp(this.configurationFilter);
    const filteredConfigurations: Configuration[] = configurations.filter(configuration => {
      return regex.test(configuration.name);
    });

    this.tl.debug(
      `CMakeSettings.json filtered configurations: '${String(filteredConfigurations)}'."`);

    if (filteredConfigurations.length === 0) {
      throw new Error(`No matching configuration for filter: '${this.configurationFilter}'.`);
    }

    // Store and restore the PATH env var for each configuration, to prevent side effects among configurations.
    const originalPath = process.env.PATH;
    for (const configuration of filteredConfigurations) {
      const msg = `Process configuration: '${configuration.name}'.`;
      try {
        this.tl.beginOperation(msg)
        console.log(msg);
        let cmakeArgs: string[] = [];

        // Search for CMake tool and run it
        let cmake: baselib.ToolRunner;
        if (this.sourceScript) {
          cmake = this.tl.tool(this.sourceScript);
          cmakeArgs.push(await this.tl.which('cmake', true));
        } else {
          cmake = this.tl.tool(await this.tl.which('cmake', true));
        }

        // Evaluate all variables in the configuration.
        const evaluator: PropertyEvaluator =
          new PropertyEvaluator(configuration, globalEnvs, this.tl);
        const evaledConf: Configuration = configuration.evaluate(evaluator);

        // Set all variable in the configuration in the process environment.
        evaledConf.setEnvironment(globalEnvs);

        // The build directory value specified in CMakeSettings.json is ignored.
        // This is because:
        // 1. you want to build targeting an empty binary directory;
        // 2. the default location in CMakeSettings.json is under the source tree, whose content is not deleted upon each build run.
        // Instead if users did not provided a specific path, let's force it to
        // "$(Build.ArtifactStagingDirectory)/{name}" which should be empty.
        console.log(`Note: the run-cmake task always ignore the 'buildRoot' value specified in the CMakeSettings.json (buildRoot=${configuration.buildDir}). User can override the default value by setting the '${globals.buildDirectory}' input.`);
        const artifactsDir = await this.tl.getArtifactsDir();
        if (utils.BaseLibUtils.normalizePath(this.buildDir) === utils.BaseLibUtils.normalizePath(artifactsDir)) {
          // The build directory goes into the artifact directory in a subdir
          // named with the configuration name.
          evaledConf.buildDir = path.join(artifactsDir, configuration.name);
        } else {
          // Append the configuration name to the user provided build directory. This is mandatory to have each 
          // build in a different directory.
          evaledConf.buildDir = path.join(this.buildDir, configuration.name);
        }
        console.log(`Overriding build directory to: '${evaledConf.buildDir}'`);

        cmakeArgs = cmakeArgs.concat(evaledConf.getGeneratorArgs().filter(this.notEmpty));
        if (this.baseUtils.isNinjaGenerator(cmakeArgs)) {
          const ninjaPath: string = await this.ninjaLib.retrieveNinjaPath(this.ninjaPath, this.ninjaDownloadUrl);
          cmakeArgs.push(`-DCMAKE_MAKE_PROGRAM=${ninjaPath}`);
        }

        if (!this.isMultiConfigGenerator(evaledConf.generator)) {
          cmakeArgs.push(`-DCMAKE_BUILD_TYPE=${evaledConf.type}`);
        }

        for (const variable of evaledConf.variables) {
          cmakeArgs.push(variable.toString());
        }

        if (evaledConf.cmakeToolchain) {
          cmakeArgs.push(`-DCMAKE_TOOLCHAIN_FILE=${evaledConf.cmakeToolchain}`);
        }

        // Use vcpkg toolchain if requested.
        if (this.useVcpkgToolchain === true) {
          cmakeArgs = await this.cmakeUtils.injectVcpkgToolchain(cmakeArgs, this.vcpkgTriplet, this.tl)
        }

        // Add the current args in the tool, add
        // custom args, and reset the args.
        for (const arg of cmakeArgs) {
          cmake.arg(arg);
        }
        cmakeArgs = [];

        // Add CMake args from CMakeSettings.json file.
        cmake.line(evaledConf.cmakeArgs);

        // Set the source directory.
        cmake.arg(path.dirname(this.cmakeSettingsJson));

        // Run CNake with the given arguments.
        if (!evaledConf.buildDir) {
          throw new Error("Build directory is not specified.");
        }

        // Append user provided CMake arguments.
        cmake.line(this.appendedCMakeArgs);

        await this.tl.mkdirP(evaledConf.buildDir);

        const options = {
          cwd: evaledConf.buildDir,
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
        await using(utils.Matcher.createMatcher('cmake', this.baseLib, this.cmakeSettingsJson), async matcher => {
          code = await this.baseUtils.wrapOp("Generate project files with CMake", () => cmake.exec(options));
        });
        if (code !== 0) {
          throw new Error(`"CMake failed with error code: '${code}'."`);
        }

        if (this.doBuild) {
          await using(utils.Matcher.createMatcher(cmakerunner.CMakeRunner.getBuildMatcher(this.buildDir, this.tl), this.tl), async matcher => {
            await this.baseUtils.wrapOp("Build with CMake", async () => await cmakerunner.CMakeRunner.build(this.tl, evaledConf.buildDir,
              // CMakeSettings.json contains in buildCommandArgs the arguments to the make program
              //only. They need to be put after '--', otherwise would be passed to directly to cmake.
              ` ${evaledConf.getGeneratorBuildArgs()} -- ${evaledConf.makeArgs}`,
              options))
          });
        }

        // Restore the original PATH environment variable.
        process.env.PATH = originalPath;
      } finally {
        this.tl.endOperation();
      }
    }
  }

  private notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
    return value !== null && value !== undefined;
  }

  private isMultiConfigGenerator(generatorName: string): boolean {
    return generatorName.includes("Visual Studio") ||
      generatorName.includes("Ninja Multi-Config");
  }

}
