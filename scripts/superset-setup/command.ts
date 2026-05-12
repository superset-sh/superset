import { spawnSync } from "node:child_process";

export interface CommandResult {
	ok: boolean;
	status: number | null;
	stdout: string;
	stderr: string;
}

interface CommandOptions {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	input?: string;
}

function mergedEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	return {
		...process.env,
		...(env ?? {}),
	};
}

function commandErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

export function commandExists(command: string): boolean {
	const result = spawnSync(
		"sh",
		["-c", `command -v ${shellQuote(command)} >/dev/null 2>&1`],
		{ encoding: "utf8" },
	);
	return result.status === 0;
}

export function runCommand(
	command: string,
	args: string[],
	options: CommandOptions = {},
): boolean {
	const result = spawnSync(command, args, {
		cwd: options.cwd,
		env: mergedEnv(options.env),
		input: options.input,
		stdio:
			options.input === undefined ? "inherit" : ["pipe", "inherit", "inherit"],
		encoding: "utf8",
	});

	if (result.error) {
		console.error(commandErrorMessage(result.error));
		return false;
	}

	return result.status === 0;
}

export function captureCommand(
	command: string,
	args: string[],
	options: CommandOptions = {},
): CommandResult {
	const result = spawnSync(command, args, {
		cwd: options.cwd,
		env: mergedEnv(options.env),
		input: options.input,
		encoding: "utf8",
		stdio: ["pipe", "pipe", "pipe"],
	});

	const stdout = typeof result.stdout === "string" ? result.stdout : "";
	const stderr = typeof result.stderr === "string" ? result.stderr : "";

	if (result.error) {
		return {
			ok: false,
			status: result.status,
			stdout,
			stderr: stderr || commandErrorMessage(result.error),
		};
	}

	return {
		ok: result.status === 0,
		status: result.status,
		stdout,
		stderr,
	};
}

export function printCapturedFailure(result: CommandResult): void {
	if (result.stderr.trim()) {
		process.stderr.write(result.stderr);
	}
}
