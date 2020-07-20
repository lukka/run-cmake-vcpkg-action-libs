import * as path from 'path';
import * as fs from 'fs';
import { assert } from 'console';

export interface BaseLibAnswerExecResult {
    code: number,
    stdout?: string,
    stderr?: string
}

export interface TaskLibAnswers {
    /*  checkPath?: { [key: string]: boolean },
      cwd?: { [key: string]: string },*/
    exec?: { [key: string]: BaseLibAnswerExecResult },
    exist?: { [key: string]: boolean },
    /*find?: { [key: string]: string[] },
    findMatch?: { [key: string]: string[] },
    getPlatform?: { [key: string]: task.Platform },
    ls?: { [key: string]: string },
    osType?: { [key: string]: string },
    rmRF?: { [key: string]: { success: boolean } },*/
    stats?: { [key: string]: any },
    which?: { [key: string]: string },
}

export type MockedCommand = keyof TaskLibAnswers;

type ConsoleLogger = (msg: string) => void;
export class MockAnswers {
    private static defaultLogger: ConsoleLogger = (msg: string) => console.log(msg);
    private answers: TaskLibAnswers | undefined;

    public reset(answers: TaskLibAnswers) {
        if (!answers) {
            throw new Error('Answers not supplied');
        }
        this.answers = answers;
    }

    public getResponse(cmd: MockedCommand, key: string, debug: ConsoleLogger = MockAnswers.defaultLogger): any {
        debug(`looking up mock answers for ${JSON.stringify(cmd)}, key ${JSON.stringify(key)}`);
        if (!this.answers) {
            throw new Error('Must initialize');
        }

        if (!this.answers[cmd]) {
            debug(`no mock responses registered for ${JSON.stringify(cmd)}`);
            throw new Error("No response found");
        }

        const cmdAnswer: any = this.answers[cmd]!;

        const answer = cmdAnswer[key];
        if (answer) {
            debug(`found mock response: ${JSON.stringify(answer)}`);
            return answer;
        }

        debug('mock response not found');
        throw new Error("No response found");
    }

    public printResponse(cmd: MockedCommand, key: string): void {
        const res = this.getResponse(cmd, key);
        if (!res) {
            assert(false, `${cmd} not found`);
        } else {
            console.log(res.stdout);
            console.log(res.stderr);
        }
    }
}

let mock: MockAnswers = new MockAnswers();

export function setAnswers(answers: TaskLibAnswers) {
    mock.reset(answers);
}

export interface IExecOptions extends IExecSyncOptions {
    failOnStdErr?: boolean;
    ignoreReturnCode?: boolean;
};

export interface IExecSyncOptions {
    cwd?: string;
    env?: { [key: string]: string };
    silent?: boolean;
    outStream: NodeJS.WritableStream;
    errStream: NodeJS.WritableStream;
    windowsVerbatimArguments?: boolean;
};

export interface IExecSyncResult {
    stdout: string;
    stderr: string;
    code: number;
    error: Error;
}

/*
export function debug(message) {
    // do nothing, overridden
}

export class ToolRunner extends events.EventEmitter {
    constructor(toolPath: string) {
        debug('toolRunner toolPath: ' + toolPath);

        super();

        this.toolPath = toolPath;
        this.args = [];
    }

    private toolPath: string;
    private args: string[];
    private pipeOutputToTool: ToolRunner | undefined;

    private _debug(message) {
        debug(message);
        this.emit('debug', message);
    }

    private _argStringToArray(argString: string): string[] {
        var args: string[] = [];

        var inQuotes = false;
        var escaped =false;
        var arg = '';

        var append = function(c: string) {
            // we only escape double quotes.
            if (escaped && c !== '"') {
                arg += '\\';
            }

            arg += c;
            escaped = false;
        }

        for (var i=0; i < argString.length; i++) {
            var c = argString.charAt(i);

            if (c === '"') {
                if (!escaped) {
                    inQuotes = !inQuotes;
                }
                else {
                    append(c);
                }
                continue;
            }

            if (c === "\\" && inQuotes) {
                escaped = true;
                continue;
            }

            if (c === ' ' && !inQuotes) {
                if (arg.length > 0) {
                    args.push(arg);
                    arg = '';
                }
                continue;
            }

            append(c);
        }

        if (arg.length > 0) {
            args.push(arg.trim());
        }

        return args;
    }

    public arg(val: any): ToolRunner {
        if (!val) {
            return this;
        }

        if (val instanceof Array) {
            this._debug(this.toolPath + ' arg: ' + JSON.stringify(val));
            this.args = this.args.concat(val);
        }
        else if (typeof(val) === 'string') {
            this._debug(this.toolPath + ' arg: ' + val);
            this.args = this.args.concat(val.trim());
        }

        return this;
    }

    public argIf(condition: any, val: any): ToolRunner {
        if (condition) {
            this.arg(val);
        }

        return this;
    }

    public line(val: string): ToolRunner {
        if (!val) {
            return this;
        }

        this._debug(this.toolPath + ' arg: ' + val);
        this.args = this.args.concat(this._argStringToArray(val));
        return this;
    }

    public pipeExecOutputToTool(tool: ToolRunner) : ToolRunner {
        this.pipeOutputToTool = tool;
        return this;
    }

    private ignoreTempPath(cmdString: string): string {
        this._debug('ignoreTempPath=' + process.env['MOCK_IGNORE_TEMP_PATH']);
        this._debug('tempPath=' + process.env['MOCK_TEMP_PATH']);
        if (process.env['MOCK_IGNORE_TEMP_PATH'] === 'true') {
            // Using split/join to replace the temp path
            cmdString = cmdString.split(process.env['MOCK_TEMP_PATH']).join('');
        }

        return cmdString;
    }

    //
    // Exec - use for long running tools where you need to stream live output as it runs
    //        returns a promise with return code.
    //
    public exec(options?: IExecOptions): Q.Promise<number> {
        var defer = Q.defer<number>();

        this._debug('exec tool: ' + this.toolPath);
        this._debug('Arguments:');
        this.args.forEach((arg) => {
            this._debug('   ' + arg);
        });

        var success = true;
        options = options || <IExecOptions>{};

        var ops: IExecOptions = {
            cwd: options.cwd || process.cwd(),
            env: options.env || process.env,
            silent: options.silent || false,
            outStream: options.outStream || process.stdout,
            errStream: options.errStream || process.stderr,
            failOnStdErr: options.failOnStdErr || false,
            ignoreReturnCode: options.ignoreReturnCode || false,
            windowsVerbatimArguments: options.windowsVerbatimArguments
        };

        var argString = this.args.join(' ') || '';
        var cmdString = this.toolPath;
        if (argString) {
            cmdString += (' ' + argString);
        }

        // Using split/join to replace the temp path
        cmdString = this.ignoreTempPath(cmdString);

        if (!ops.silent) {
            if(this.pipeOutputToTool) {
                var pipeToolArgString = this.pipeOutputToTool.args.join(' ') || '';
                var pipeToolCmdString = this.ignoreTempPath(this.pipeOutputToTool.toolPath);
                if(pipeToolArgString) {
                    pipeToolCmdString += (' ' + pipeToolArgString);
                }

                cmdString += ' | ' + pipeToolCmdString;
            }

            ops.outStream.write('[command]' + cmdString + os.EOL);
        }

        // TODO: filter process.env
        var res = mock.getResponse('exec', cmdString, debug);
        if (res.stdout) {
            this.emit('stdout', res.stdout);
            if (!ops.silent) {
                ops.outStream.write(res.stdout + os.EOL);
            }
            const stdLineArray = res.stdout.split(os.EOL);
            for (const line of stdLineArray.slice(0, -1)) {
                this.emit('stdline', line);
            }
            if(stdLineArray.length > 0 && stdLineArray[stdLineArray.length - 1].length > 0) {
                this.emit('stdline', stdLineArray[stdLineArray.length - 1]);
            }
        }

        if (res.stderr) {
            this.emit('stderr', res.stderr);

            success = !ops.failOnStdErr;
            if (!ops.silent) {
                var s = ops.failOnStdErr ? ops.errStream : ops.outStream;
                s.write(res.stderr + os.EOL);
            }
            const stdErrArray = res.stderr.split(os.EOL);
            for (const line of stdErrArray.slice(0, -1)) {
                this.emit('errline', line);
            }
            if (stdErrArray.length > 0 && stdErrArray[stdErrArray.length - 1].length > 0) {
                this.emit('errline', stdErrArray[stdErrArray.length - 1]);
            }
        }


        var code = res.code;

        if (!ops.silent) {
            ops.outStream.write('rc:' + res.code + os.EOL);
        }

        if (code != 0 && !ops.ignoreReturnCode) {
            success = false;
        }

        if (!ops.silent) {
            ops.outStream.write('success:' + success + os.EOL);
        }
        if (success) {
            defer.resolve(code);
        }
        else {
            defer.reject(new Error(this.toolPath + ' failed with return code: ' + code));
        }

        return <Q.Promise<number>>defer.promise;
    }

    //
    // ExecSync - use for short running simple commands.  Simple and convenient (synchronous)
    //            but also has limits.  For example, no live output and limited to max buffer
    //
    public execSync(options?: IExecSyncOptions): IExecSyncResult {
        var defer = Q.defer();

        this._debug('exec tool: ' + this.toolPath);
        this._debug('Arguments:');
        this.args.forEach((arg) => {
            this._debug('   ' + arg);
        });

        var success = true;
        options = options || <IExecOptions>{};

        var ops: IExecSyncOptions = {
            cwd: options.cwd || process.cwd(),
            env: options.env || process.env,
            silent: options.silent || false,
            outStream: options.outStream || process.stdout,
            errStream: options.errStream || process.stderr,
            windowsVerbatimArguments: options.windowsVerbatimArguments,
        };

        var argString = this.args.join(' ') || '';
        var cmdString = this.toolPath;

        // Using split/join to replace the temp path
        cmdString = this.ignoreTempPath(cmdString);

        if (argString) {
            cmdString += (' ' + argString);
        }

        if (!ops.silent) {
            ops.outStream.write('[command]' + cmdString + os.EOL);
        }

        var r = mock.getResponse('exec', cmdString, debug);
        if (!ops.silent && r.stdout && r.stdout.length > 0) {
            ops.outStream.write(r.stdout);
        }

        if (!ops.silent && r.stderr && r.stderr.length > 0) {
            ops.errStream.write(r.stderr);
        }

        return <IExecSyncResult>{
            code: r.code,
            stdout: (r.stdout) ? r.stdout.toString() : null,
            stderr: (r.stderr) ? r.stderr.toString() : null
        };
    }
}
*/

class Inputs {
    [name: string]: string
};

export class MockInputs {
    private inputs: Inputs;

    constructor() {
        this.inputs = new Inputs();
    }

    public reset(): void {
        this.inputs = new Inputs();
    }

    public setInput(name: string, value: string): void {
        this.inputs[name] = value;
    }

    public setBooleanInput(name: string, value: boolean): void {
        this.inputs[name] = value.toString();
    }

    public getInput(name: string, required?: boolean): string {
        return <string>this.inputs[name];
    }
    public getBooleanInput(name: string, required?: boolean): boolean {
        return this.inputs[name].toLowerCase() === "true";
    }
    public getDelimitedInput(name: string, separator?: string, required?: boolean): string[] {
        return <string[]>(this.inputs[name].split('\n'));
    };
}