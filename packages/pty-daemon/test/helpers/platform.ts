import * as os from "node:os";
import * as path from "node:path";
import type { SessionMeta } from "../../src/protocol/index.ts";

export function makeDaemonSocketPath(prefix: string): string {
	const id = `${prefix}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
	if (process.platform === "win32") {
		return `\\\\.\\pipe\\${id}`;
	}
	return path.join(os.tmpdir(), `${id}.sock`);
}

export function commandMeta(command: string): SessionMeta {
	if (process.platform === "win32") {
		return {
			shell: process.env.COMSPEC || "cmd.exe",
			argv: ["/d", "/s", "/c", command],
			cols: 80,
			rows: 24,
		};
	}
	return {
		shell: "/bin/sh",
		argv: ["-c", command],
		cols: 80,
		rows: 24,
	};
}

export function joinCommands(commands: string[]): string {
	return commands.join(process.platform === "win32" ? " & " : "; ");
}

export function interactiveMeta(): SessionMeta {
	if (process.platform === "win32") {
		return {
			shell: process.env.COMSPEC || "cmd.exe",
			argv: ["/d"],
			cols: 80,
			rows: 24,
		};
	}
	return { shell: "/bin/sh", argv: ["-i"], cols: 80, rows: 24 };
}

export function successCommand(): string {
	return process.platform === "win32" ? "exit /b 0" : "true";
}

export function exitCommand(code: number): string {
	return process.platform === "win32" ? `exit /b ${code}` : `exit ${code}`;
}

export function sleepCommand(seconds: number): string {
	if (process.platform === "win32") {
		return `ping -n ${Math.max(2, Math.ceil(seconds) + 1)} 127.0.0.1 >NUL`;
	}
	return `sleep ${seconds}`;
}

export function closeSignal(): "SIGKILL" | "SIGTERM" {
	return process.platform === "win32" ? "SIGKILL" : "SIGTERM";
}

export function inputLine(command: string): Buffer {
	return Buffer.from(
		`${command}${process.platform === "win32" ? "\r\n" : "\n"}`,
	);
}
