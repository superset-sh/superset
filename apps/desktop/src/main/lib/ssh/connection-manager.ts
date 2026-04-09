import {
	type ChildProcess,
	spawn as childProcessSpawn,
	execFile,
} from "node:child_process";
import { existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { IPty } from "node-pty";
import * as pty from "node-pty";
import type { SshConnectionConfig } from "./types";

const SSH_BINARY = "ssh";
const START_TIMEOUT_MS = 15_000;
const RETRY_DELAYS_MS = [1_000, 2_000];

export class SshConnectionError extends Error {
	constructor(
		message: string,
		public readonly cause?: Error,
	) {
		super(message);
		this.name = "SshConnectionError";
	}
}

export class SshConnectionManager {
	readonly controlDir: string;
	readonly controlPath: string;

	constructor(
		private readonly config: SshConnectionConfig,
		private readonly workspaceId: string,
	) {
		// Use /tmp to keep socket paths short — Unix sockets have ~104 byte path limit.
		// App Support paths (especially on macOS) are too long.
		const shortId = workspaceId.replace(/-/g, "").slice(0, 12);
		this.controlDir = join("/tmp", "superset-ssh");
		this.controlPath = join(this.controlDir, `ctl-${shortId}`);
		mkdirSync(this.controlDir, { recursive: true });
	}

	private buildBaseArgs(): string[] {
		return [
			"-o",
			`ControlPath=${this.controlPath}`,
			"-o",
			"ServerAliveInterval=60",
			"-o",
			"ServerAliveCountMax=3",
			"-o",
			"ConnectTimeout=10",
			"-o",
			"StrictHostKeyChecking=accept-new",
			"-p",
			String(this.config.port),
			...(this.config.identityFile ? ["-i", this.config.identityFile] : []),
			`${this.config.user}@${this.config.host}`,
		];
	}

	async start(): Promise<void> {
		const args = ["-fN", "-o", "ControlMaster=auto", ...this.buildBaseArgs()];

		await new Promise<void>((resolve, reject) => {
			const child = childProcessSpawn(SSH_BINARY, args, {
				stdio: ["ignore", "pipe", "pipe"],
			});
			let settled = false;
			let stderr = "";

			const timeoutId = setTimeout(() => {
				if (settled) return;
				settled = true;
				child.kill();
				reject(new SshConnectionError("SSH connection start timed out"));
			}, START_TIMEOUT_MS);

			child.stderr?.on("data", (chunk: Buffer | string) => {
				stderr += chunk.toString();
			});

			child.once("error", (error) => {
				if (settled) return;
				settled = true;
				clearTimeout(timeoutId);
				reject(new SshConnectionError("Failed to start SSH connection", error));
			});

			child.once("exit", (code) => {
				if (settled) return;
				settled = true;
				clearTimeout(timeoutId);
				if (code === 0) {
					resolve();
					return;
				}

				reject(
					new SshConnectionError(
						stderr.trim() || `SSH exited with code ${code ?? "unknown"}`,
					),
				);
			});
		});
	}

	async isAlive(): Promise<boolean> {
		try {
			await this.execFileChecked(["-O", "check", ...this.buildBaseArgs()]);
			return true;
		} catch {
			return false;
		}
	}

	async stop(): Promise<void> {
		try {
			await this.execFileChecked(["-O", "exit", ...this.buildBaseArgs()]);
		} catch {}

		try {
			unlinkSync(this.controlPath);
		} catch {}
	}

	async exec(
		command: string,
	): Promise<{ stdout: string; stderr: string; exitCode: number }> {
		const args = [...this.buildBaseArgs(), "--", command];
		return new Promise((resolve, reject) => {
			const child = childProcessSpawn(SSH_BINARY, args, {
				stdio: ["pipe", "pipe", "pipe"],
			});
			let stdout = "";
			let stderr = "";

			child.stdout?.on("data", (chunk: Buffer | string) => {
				stdout += chunk.toString();
			});
			child.stderr?.on("data", (chunk: Buffer | string) => {
				stderr += chunk.toString();
			});

			child.once("error", (error) => {
				reject(new SshConnectionError("Failed to execute SSH command", error));
			});

			child.once("close", (code) => {
				resolve({
					stdout,
					stderr,
					exitCode: code ?? -1,
				});
			});
		});
	}

	spawn(command: string): ChildProcess {
		return childProcessSpawn(
			SSH_BINARY,
			["-tt", ...this.buildBaseArgs(), "--", command],
			{
				stdio: ["pipe", "pipe", "pipe"],
			},
		);
	}

	spawnPty(command: string, opts: { cols: number; rows: number }): IPty {
		const sshArgs = ["-tt", ...this.buildBaseArgs(), "--", command];
		const sshCmd = [SSH_BINARY, ...sshArgs]
			.map((a) => `'${a.replaceAll("'", `'\\''`)}'`)
			.join(" ");
		return pty.spawn(
			"/bin/sh",
			[
				"-c",
				`stty intr undef quit undef susp undef 2>/dev/null; exec ${sshCmd}`,
			],
			{
				name: "xterm-256color",
				cols: opts.cols,
				rows: opts.rows,
				cwd: process.env.HOME,
			},
		);
	}

	async ensureAlive(): Promise<void> {
		let lastError: Error | undefined;

		for (let attempt = 0; attempt < RETRY_DELAYS_MS.length + 1; attempt++) {
			if (await this.isAlive()) {
				return;
			}

			try {
				await this.start();
				return;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
			}

			const delay = RETRY_DELAYS_MS[attempt];
			if (delay) {
				await this.sleep(delay);
			}
		}

		throw new SshConnectionError(
			`SSH connection failed after 3 attempts${lastError ? `: ${lastError.message}` : ""}`,
			lastError,
		);
	}

	static async cleanupStale(_userData?: string): Promise<void> {
		const controlDir = join("/tmp", "superset-ssh");
		if (!existsSync(controlDir)) {
			return;
		}

		let entries: string[] = [];
		try {
			entries = readdirSync(controlDir);
		} catch {
			return;
		}

		for (const entry of entries) {
			if (!entry.startsWith("ctl-")) {
				continue;
			}

			const socketPath = join(controlDir, entry);
			try {
				await new Promise<void>((resolve, reject) => {
					execFile(
						SSH_BINARY,
						["-O", "check", "-o", `ControlPath=${socketPath}`, "dummy@dummy"],
						(error) => {
							if (error) {
								reject(error);
								return;
							}
							resolve();
						},
					);
				});
			} catch {
				try {
					unlinkSync(socketPath);
				} catch {}
			}
		}
	}

	private execFileChecked(
		args: string[],
	): Promise<{ stdout: string; stderr: string }> {
		return new Promise((resolve, reject) => {
			execFile(SSH_BINARY, args, (error, stdout, stderr) => {
				if (error) {
					reject(new SshConnectionError(stderr.trim() || error.message, error));
					return;
				}

				resolve({ stdout, stderr });
			});
		});
	}

	private getControlSocketFiles(): string[] {
		if (!existsSync(this.controlDir)) {
			return [];
		}

		const prefix = `ctl-${this.workspaceId}-`;
		return readdirSync(this.controlDir)
			.filter((entry) => entry.startsWith(prefix))
			.map((entry) => join(this.controlDir, entry));
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => {
			setTimeout(resolve, ms);
		});
	}
}
