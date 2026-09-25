import { spawn } from "node:child_process";
import { CLIError } from "@superset/cli-framework";

export interface SshTarget {
	user?: string;
	host: string;
	port?: number;
}

export interface SshRunResult {
	code: number;
	stdout: string;
	stderr: string;
}

const BRACKETED_IPV6 = /^\[([^\]]+)\](?::(\d+))?$/;

function invalid(target: string, hint: string): CLIError {
	return new CLIError(`Invalid SSH target: ${target}`, hint);
}

function parsePort(raw: string, target: string): number {
	const port = Number(raw);
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw invalid(target, "Port must be a whole number between 1 and 65535.");
	}
	return port;
}

/** Parse `[user@]host[:port]`, including bracketed IPv6 (`user@[::1]:22`). */
export function parseSshTarget(raw: string): SshTarget {
	const target = raw.trim();
	if (!target) {
		throw invalid(raw, "Pass a destination such as user@host.");
	}
	// ssh reads a leading dash as a flag, so a target like `-oProxyCommand=…`
	// would smuggle arbitrary ssh options past this command's own options.
	if (target.startsWith("-")) {
		throw invalid(target, "A destination cannot start with '-'.");
	}
	if (/\s/.test(target)) {
		throw invalid(target, "A destination cannot contain whitespace.");
	}

	const at = target.lastIndexOf("@");
	const user = at === -1 ? undefined : target.slice(0, at);
	const rest = at === -1 ? target : target.slice(at + 1);
	if (at !== -1 && !user) throw invalid(target, "Missing a user before '@'.");
	if (!rest) throw invalid(target, "Missing a hostname.");

	const bracketed = rest.match(BRACKETED_IPV6);
	if (bracketed?.[1]) {
		const port = bracketed[2];
		return {
			user,
			host: bracketed[1],
			...(port ? { port: parsePort(port, target) } : {}),
		};
	}

	// A bare IPv6 literal has several colons and no port; exactly one colon is
	// unambiguously host:port.
	if (rest.split(":").length === 2) {
		const [host, port] = rest.split(":");
		if (!host) throw invalid(target, "Missing a hostname before ':'.");
		return { user, host, port: parsePort(port ?? "", target) };
	}

	return { user, host: rest };
}

export function formatSshDestination(target: SshTarget): string {
	return target.user ? `${target.user}@${target.host}` : target.host;
}

/** Human-readable destination including the port, for messages only. */
export function describeSshTarget(target: SshTarget): string {
	const destination = formatSshDestination(target);
	return target.port ? `${destination}:${target.port}` : destination;
}

export interface SshArgsOptions {
	identity?: string;
	port?: number;
	/** Fail instead of prompting for a password or host-key confirmation. */
	batch: boolean;
	connectTimeoutSec?: number;
}

export function buildSshArgs(
	target: SshTarget,
	options: SshArgsOptions,
): string[] {
	const args = [
		"-o",
		`ConnectTimeout=${options.connectTimeoutSec ?? 15}`,
		...(options.batch ? ["-o", "BatchMode=yes"] : []),
	];
	const port = options.port ?? target.port;
	if (port) args.push("-p", String(port));
	if (options.identity) args.push("-i", options.identity);
	// `sh -s` reads the script from stdin, which keeps the API key out of argv
	// on both machines — `ps` on the remote box would otherwise show it.
	args.push(formatSshDestination(target), "sh -s");
	return args;
}

/** Pipe a shell script to the remote host over stdin and collect its output. */
export function runSshScript(
	target: SshTarget,
	script: string,
	options: SshArgsOptions & { signal?: AbortSignal },
): Promise<SshRunResult> {
	const args = buildSshArgs(target, options);

	return new Promise((resolve, reject) => {
		if (options.signal?.aborted) {
			reject(new CLIError("Cancelled before connecting"));
			return;
		}

		const child = spawn("ssh", args, {
			stdio: ["pipe", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});

		const onAbort = () => child.kill("SIGTERM");
		options.signal?.addEventListener("abort", onAbort, { once: true });
		const done = () => options.signal?.removeEventListener("abort", onAbort);

		child.on("error", (error: NodeJS.ErrnoException) => {
			done();
			if (error.code === "ENOENT") {
				reject(
					new CLIError(
						"ssh is not installed on this machine",
						"Install an OpenSSH client and try again.",
					),
				);
				return;
			}
			reject(error);
		});

		child.on("close", (code, killedBy) => {
			done();
			if (code === null) {
				reject(new CLIError(`ssh terminated by ${killedBy ?? "signal"}`));
				return;
			}
			resolve({ code, stdout, stderr });
		});

		child.stdin.on("error", () => {
			// A remote shell that exits before reading the whole script closes
			// the pipe; the exit code below is the real diagnosis.
		});
		child.stdin.end(script);
	});
}

/** Last few lines of ssh's stderr, for an error hint. */
export function stderrHint(stderr: string, lines = 4): string | undefined {
	const trimmed = stderr.trim();
	if (!trimmed) return undefined;
	return trimmed.split("\n").slice(-lines).join("\n");
}
