import { assert } from 'console';

export function testWithHeader(name: string, fn?: any, timeout?: number): void {
    console.log(`>>> EXECUTING TEST: '${name}'`);
    test(name, fn, timeout);
}

/**
 * Generate output for the test purpose only.
 *
 * @param {string} msg The message.
 */
export function testLog(msg: string) {
    console.log(`test: ${msg}`);
}

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

        debug(`no mock found registered for cmd=${JSON.stringify(cmd)} key=${key}, mocks=${JSON.stringify(this)}`);
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
        if (!(name in this.inputs)) {
            testLog(`input '${name}' not found`);
            return "";
        }
        return this.inputs[name] as string;
    }
    public getBooleanInput(name: string, required?: boolean): boolean {
        if (!(name in this.inputs)) {
            testLog(`input '${name}' not found`);
            return false;
        }
        return this.inputs[name].toLowerCase() === "true";
    }
    public getDelimitedInput(name: string, separator?: string, required?: boolean): string[] {
        if (!(name in this.inputs)) {
            testLog(`input '${name}' not found`);
            return [];
        }
        return (this.inputs[name].split('\n')) as string[];
    };
}

export function normalizePath(path: string): string {
    return path.replace(/\\/g, '/')
}

export function areEqualVerbose(text: string, text2: string) {
    const result: boolean = text === text2;
    testLog(`Compare '${text}' and '${text2}': ${result} `);
    return result;
}