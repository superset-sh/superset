import { execFile, spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

export type DictationErrorKind =
	| "DISABLED"
	| "UNAVAILABLE"
	| "MODE_NOT_READY"
	| "INVALID_AUDIO"
	| "TIMEOUT"
	| "TRANSCRIPTION_FAILED"
	| "RESTORE_FAILED";

export class DictationError extends Error {
	constructor(
		public readonly kind: DictationErrorKind,
		message: string,
	) {
		super(message);
	}
}

export interface SuperwhisperDependencies {
	platform: string;
	home: string;
	temporaryDirectory: string;
	fs: Pick<
		typeof fs,
		"access" | "readFile" | "writeFile" | "mkdir" | "mkdtemp" | "readdir" | "rm"
	>;
	run(
		command: string,
		args: string[],
		options: { timeoutMs: number; input?: string; env?: NodeJS.ProcessEnv },
	): Promise<string>;
	acquireLock(path: string, timeoutMs: number): Promise<() => Promise<void>>;
	warn(message: string, error: unknown): void;
	now(): number;
	sleep(ms: number): Promise<void>;
}

function acquireFileLock(
	path: string,
	timeoutMs: number,
): Promise<() => Promise<void>> {
	return new Promise((resolve, reject) => {
		const child = spawn(
			"/usr/bin/lockf",
			[
				"-k",
				"-t",
				String(Math.ceil(timeoutMs / 1000)),
				path,
				"/bin/sh",
				"-c",
				"printf ready; /bin/cat >/dev/null",
			],
			{ stdio: ["pipe", "pipe", "pipe"] },
		);
		let acquired = false;
		let output = "";
		let finish!: () => void;
		const exited = new Promise<void>((done) => {
			finish = done;
		});
		child.once("error", (error) => {
			reject(error);
			finish();
		});
		child.stdin.on("error", () => {});
		child.stderr.resume();
		child.once("exit", (code) => {
			finish();
			if (!acquired)
				reject(
					code === 75
						? new DictationError(
								"TIMEOUT",
								"Superwhisper is busy with another dictation",
							)
						: new Error(
								`Could not acquire the Superwhisper dictation lock (${code})`,
							),
				);
		});
		child.stdout.on("data", (chunk) => {
			output += chunk.toString();
			if (!acquired && output.includes("ready")) {
				acquired = true;
				resolve(async () => {
					child.stdin.end();
					await exited;
				});
			}
		});
	});
}

export const systemSuperwhisperDependencies: SuperwhisperDependencies = {
	platform: process.platform,
	home: homedir(),
	temporaryDirectory: tmpdir(),
	fs,
	acquireLock: acquireFileLock,
	warn: (message, error) => console.warn(message, error),
	now: () => performance.now(),
	sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
	run: (command, args, { timeoutMs, input, env }) =>
		new Promise((resolve, reject) => {
			const child = execFile(
				command,
				args,
				{
					timeout: timeoutMs,
					killSignal: "SIGKILL",
					maxBuffer: 256 * 1024 * 1024,
					env,
				},
				(error, stdout) => {
					if (error) reject(error);
					else resolve(stdout);
				},
			);
			child.stdin?.on("error", reject);
			child.stdin?.end(input);
		}),
};

const APP = "/Applications/superwhisper.app";
const DOMAIN = "com.superduper.superwhisper";
const TIMEOUT_MS = 30_000;
const RESTORE_TIMEOUT_MS = TIMEOUT_MS;

function modeIsSafe(value: unknown): boolean {
	if (!value || typeof value !== "object") return false;
	const mode = value as Record<string, unknown>;
	return (
		mode.key === "superset" &&
		mode.name === "Superset" &&
		mode.autoPaste === false &&
		mode.realtimeOutput !== true &&
		mode.scriptEnabled !== true
	);
}

function usesLanguageModel(value: Record<string, unknown>): boolean {
	return [value.languageModelID, value.languageModelName].some(
		(field) => typeof field === "string" && field.trim().length > 0,
	);
}

export function wavDurationMs(wav: Buffer): number {
	if (
		wav.length < 12 ||
		wav.toString("ascii", 0, 4) !== "RIFF" ||
		wav.toString("ascii", 8, 12) !== "WAVE"
	) {
		throw new DictationError(
			"INVALID_AUDIO",
			"Audio conversion did not produce a WAV file",
		);
	}
	let byteRate = 0;
	let dataBytes = 0;
	for (let offset = 12; offset + 8 <= wav.length; ) {
		const size = wav.readUInt32LE(offset + 4);
		const start = offset + 8;
		if (start + size > wav.length)
			throw new DictationError("INVALID_AUDIO", "WAV audio is truncated");
		const kind = wav.toString("ascii", offset, offset + 4);
		if (kind === "fmt " && size >= 16) {
			const format = wav.readUInt16LE(start);
			const extensiblePcm =
				format === 0xfffe &&
				size >= 40 &&
				wav.readUInt16LE(start + 18) === 16 &&
				wav
					.subarray(start + 24, start + 40)
					.equals(Buffer.from("0100000000001000800000aa00389b71", "hex"));
			if (
				(format !== 1 && !extensiblePcm) ||
				wav.readUInt16LE(start + 2) !== 1 ||
				wav.readUInt32LE(start + 4) !== 16_000 ||
				wav.readUInt16LE(start + 14) !== 16
			) {
				throw new DictationError(
					"INVALID_AUDIO",
					"Audio must be 16 kHz mono PCM",
				);
			}
			byteRate = wav.readUInt32LE(start + 8);
		}
		if (kind === "data") dataBytes += size;
		offset = start + size + (size % 2);
	}
	if (byteRate !== 32_000 || !dataBytes)
		throw new DictationError("INVALID_AUDIO", "Audio is empty or invalid");
	return (dataBytes / byteRate) * 1000;
}

export class SuperwhisperAdapter {
	private queue: Promise<unknown> = Promise.resolve();

	constructor(private readonly deps: SuperwhisperDependencies) {}

	private async readAppDirectory(timeoutMs = TIMEOUT_MS): Promise<string> {
		let folder = "";
		try {
			folder = (
				await this.deps.run(
					"/usr/bin/defaults",
					["read", DOMAIN, "appFolderDirectory"],
					{ timeoutMs },
				)
			).trim();
		} catch {}
		return join(folder || this.deps.home, "superwhisper");
	}

	private async exists(path: string): Promise<boolean> {
		try {
			await this.deps.fs.access(path);
			return true;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
			throw error;
		}
	}

	async status(): Promise<{ installed: boolean; modeReady: boolean }> {
		if (this.deps.platform !== "darwin")
			return { installed: false, modeReady: false };
		return this.statusIn(await this.readAppDirectory());
	}

	private async statusIn(
		appDirectory: string,
	): Promise<{ installed: boolean; modeReady: boolean }> {
		if (this.deps.platform !== "darwin")
			return { installed: false, modeReady: false };
		const installed = await this.exists(APP);
		const modePath = join(appDirectory, "modes", "superset.json");
		let modeReady = false;
		try {
			modeReady = modeIsSafe(
				JSON.parse(await this.deps.fs.readFile(modePath, "utf8")),
			);
		} catch (error) {
			if (
				!(error instanceof SyntaxError) &&
				(error as NodeJS.ErrnoException).code !== "ENOENT"
			)
				throw error;
		}
		return { installed, modeReady };
	}

	async ensureMode(): Promise<void> {
		await this.ensureModeIn(await this.readAppDirectory());
	}

	private async ensureModeIn(appDirectory: string): Promise<void> {
		if (!(await this.statusIn(appDirectory)).installed)
			throw new DictationError(
				"UNAVAILABLE",
				"Superwhisper is not installed on this Mac",
			);
		const modes = join(appDirectory, "modes");
		const modePath = join(modes, "superset.json");
		if (!(await this.exists(modePath))) {
			try {
				const source: unknown = JSON.parse(
					await this.deps.fs.readFile(join(modes, "default.json"), "utf8"),
				);
				if (!source || typeof source !== "object" || Array.isArray(source))
					throw new Error("Invalid default mode");
				await this.deps.fs.mkdir(modes, { recursive: true });
				await this.deps.fs.writeFile(
					modePath,
					JSON.stringify(
						{
							...source,
							name: "Superset",
							key: "superset",
							autoPaste: false,
							realtimeOutput: false,
							scriptEnabled: false,
						},
						null,
						2,
					),
					{ flag: "wx", mode: 0o600 },
				);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST")
					throw new DictationError(
						"MODE_NOT_READY",
						"Cannot create the Superset mode from the Superwhisper default mode",
					);
			}
		}
		if (!(await this.statusIn(appDirectory)).modeReady)
			throw new DictationError(
				"MODE_NOT_READY",
				"The Superset mode must disable automatic paste, realtime output and scripts",
			);
	}

	transcribe(audio: Buffer, mediaType: string): Promise<{ text: string }> {
		const queuedAt = this.deps.now();
		const job = this.queue.then(() =>
			this.transcribeOnce(audio, mediaType, queuedAt + TIMEOUT_MS),
		);
		this.queue = job.catch(() => {});
		return job;
	}

	private async transcribeOnce(
		audio: Buffer,
		mediaType: string,
		deadline: number,
	): Promise<{ text: string }> {
		if (this.deps.platform !== "darwin")
			throw new DictationError(
				"UNAVAILABLE",
				"Superwhisper is not installed on this Mac",
			);
		const lock = join(this.deps.home, ".superset-superwhisper.lock");
		const ms = deadline - this.deps.now();
		if (ms <= 0)
			throw new DictationError(
				"TIMEOUT",
				"Superwhisper is busy with another dictation",
			);
		const release = await this.deps.acquireLock(lock, Math.ceil(ms));
		try {
			return await this.transcribeLocked(audio, mediaType, deadline);
		} finally {
			await release();
		}
	}

	private async transcribeLocked(
		audio: Buffer,
		mediaType: string,
		deadline: number,
	): Promise<{ text: string }> {
		const remaining = () => {
			const ms = deadline - this.deps.now();
			if (ms <= 0)
				throw new DictationError(
					"TIMEOUT",
					"Superwhisper did not finish within 30 seconds. Check that file transcription is available with your license",
				);
			return Math.ceil(ms);
		};
		const command = async (name: string, args: string[]) => {
			try {
				return await this.deps.run(name, args, {
					timeoutMs: remaining(),
					...((name === "/usr/bin/pbpaste" || name === "/usr/bin/afinfo") && {
						env: { ...process.env, LC_ALL: "en_US.UTF-8" },
					}),
				});
			} catch (error) {
				remaining();
				throw error;
			}
		};
		const pause = async () => {
			await this.deps.sleep(Math.min(100, remaining()));
			remaining();
		};
		const appDirectory = await this.readAppDirectory(remaining());
		await this.ensureModeIn(appDirectory);
		let directory: string | undefined;
		let originalMode: string | undefined;
		let clipboard: string | undefined;
		let transcriptionClipboard: string | undefined;
		let clipboardSnapshotTaken = false;
		let modeChanged = false;
		let textResult = "";
		let hasResult = false;
		const originalModePath = join(
			this.deps.home,
			".superset-superwhisper.mode",
		);
		let failure: unknown;
		let restoreFailed = false;
		try {
			directory = await this.deps.fs.mkdtemp(
				join(this.deps.temporaryDirectory, "superset-dictation-"),
			);
			const input = join(
				directory,
				mediaType === "audio/wav" ? "audio.wav" : "audio.m4a",
			);
			const wav = join(directory, "converted.wav");
			await this.deps.fs.writeFile(input, audio, { mode: 0o600 });
			try {
				const info = await command("/usr/bin/afinfo", ["-r", input]);
				const seconds = Number(
					info.match(/estimated duration:\s*([\d.]+)\s*sec/i)?.[1],
				);
				if (!Number.isFinite(seconds) || seconds <= 0)
					throw new DictationError(
						"INVALID_AUDIO",
						"Cannot read the recorded audio duration",
					);
				if (seconds > 300)
					throw new DictationError(
						"INVALID_AUDIO",
						"Dictation cannot exceed five minutes",
					);
				await command("/usr/bin/afconvert", [
					"-f",
					"WAVE",
					"-d",
					"LEI16@16000",
					"-c",
					"1",
					input,
					wav,
				]);
			} catch (error) {
				if (error instanceof DictationError) throw error;
				throw new DictationError(
					"INVALID_AUDIO",
					"Cannot decode the recorded audio",
				);
			}
			const durationMs = wavDurationMs(await this.deps.fs.readFile(wav));
			if (durationMs > 300_000)
				throw new DictationError(
					"INVALID_AUDIO",
					"Dictation cannot exceed five minutes",
				);
			const recordings = join(appDirectory, "recordings");
			originalMode = (
				await command("/usr/bin/defaults", ["read", DOMAIN, "activeModeKey"])
			).trim();
			if (!originalMode)
				throw new DictationError(
					"MODE_NOT_READY",
					"Cannot read the active Superwhisper mode",
				);
			if (originalMode === "superset") {
				let savedMode = "";
				try {
					savedMode = (
						await this.deps.fs.readFile(originalModePath, "utf8")
					).trim();
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
				}
				originalMode =
					savedMode && savedMode !== "superset" ? savedMode : "default";
			}
			await this.deps.fs.writeFile(originalModePath, originalMode, {
				mode: 0o600,
			});
			modeChanged = true;
			await command("/usr/bin/open", [
				"-g",
				"superwhisper://mode?key=superset",
			]);
			while (
				(
					await command("/usr/bin/defaults", ["read", DOMAIN, "activeModeKey"])
				).trim() !== "superset"
			)
				await pause();
			try {
				clipboard = await command("/usr/bin/pbpaste", []);
			} catch (error) {
				if (error instanceof DictationError) throw error;
			}
			await this.ensureModeIn(appDirectory);
			const mode = JSON.parse(
				await this.deps.fs.readFile(
					join(appDirectory, "modes", "superset.json"),
					"utf8",
				),
			) as Record<string, unknown>;
			const previous = new Set(await this.listRecordings(recordings));
			await command("/usr/bin/open", ["-g", "-a", APP, wav]);
			while (true) {
				remaining();
				const matches: Record<string, unknown>[] = [];
				for (const id of await this.listRecordings(recordings)) {
					if (previous.has(id)) continue;
					try {
						const meta: unknown = JSON.parse(
							await this.deps.fs.readFile(
								join(recordings, id, "meta.json"),
								"utf8",
							),
						);
						if (!meta || typeof meta !== "object") continue;
						const value = meta as Record<string, unknown>;
						if (
							value.modeName === "Superset" &&
							typeof value.duration === "number" &&
							Math.abs(value.duration - durationMs) <=
								Math.max(150, durationMs * 0.02)
						)
							matches.push(value);
					} catch (error) {
						if (
							!(error instanceof SyntaxError) &&
							(error as NodeJS.ErrnoException).code !== "ENOENT"
						)
							throw error;
					}
				}
				if (matches.length > 1)
					throw new DictationError(
						"TRANSCRIPTION_FAILED",
						"More than one Superwhisper recording matches this dictation",
					);
				const meta = matches[0];
				if (meta) {
					const llm =
						typeof meta.llmResult === "string" ? meta.llmResult.trim() : "";
					const raw = typeof meta.result === "string" ? meta.result.trim() : "";
					const completed =
						typeof meta.processingTime === "number" &&
						Number.isFinite(meta.processingTime);
					if (llm || raw || completed) {
						textResult = llm || raw;
						hasResult = true;
						if (
							llm ||
							(!raw && completed) ||
							!(usesLanguageModel(mode) || usesLanguageModel(meta))
						)
							break;
					}
				}
				await pause();
			}
			if (hasResult && clipboard !== undefined && !clipboardSnapshotTaken) {
				clipboardSnapshotTaken = true;
				try {
					transcriptionClipboard = await command("/usr/bin/pbpaste", []);
				} catch (error) {
					if (error instanceof DictationError) throw error;
				}
			}
		} catch (error) {
			if (
				!(
					hasResult &&
					error instanceof DictationError &&
					error.kind === "TIMEOUT"
				)
			) {
				failure =
					error instanceof DictationError
						? error
						: new DictationError(
								"TRANSCRIPTION_FAILED",
								"Superwhisper could not transcribe this recording",
							);
			}
		} finally {
			if (modeChanged && originalMode) {
				try {
					await this.restoreMode(originalMode);
					await this.deps.fs.rm(originalModePath, { force: true });
				} catch (error) {
					restoreFailed = true;
					this.deps.warn(
						"Could not restore the Superwhisper mode after dictation",
						error,
					);
				}
			}
			if (clipboard !== undefined) {
				try {
					const env = { ...process.env, LC_ALL: "en_US.UTF-8" };
					const current = await this.deps.run("/usr/bin/pbpaste", [], {
						timeoutMs: RESTORE_TIMEOUT_MS,
						env,
					});
					if (!current || current === transcriptionClipboard) {
						await this.deps.run("/usr/bin/pbcopy", [], {
							timeoutMs: RESTORE_TIMEOUT_MS,
							input: clipboard,
							env,
						});
					}
				} catch (error) {
					restoreFailed = true;
					this.deps.warn(
						"Could not restore the clipboard after dictation",
						error,
					);
				}
			}
			try {
				if (directory)
					await this.deps.fs.rm(directory, { recursive: true, force: true });
			} catch (error) {
				restoreFailed = true;
				this.deps.warn(
					"Could not remove dictation audio after transcription",
					error,
				);
			}
		}
		if (restoreFailed && !hasResult)
			throw new DictationError(
				"RESTORE_FAILED",
				"Could not restore the Superwhisper mode or clipboard after dictation",
			);
		if (failure) throw failure;
		return { text: textResult };
	}

	private async restoreMode(originalMode: string): Promise<void> {
		const deadline = this.deps.now() + RESTORE_TIMEOUT_MS;
		await this.deps.run(
			"/usr/bin/open",
			["-g", `superwhisper://mode?key=${encodeURIComponent(originalMode)}`],
			{ timeoutMs: RESTORE_TIMEOUT_MS },
		);
		while (true) {
			const ms = deadline - this.deps.now();
			if (ms <= 0) throw new Error("Mode restore timed out");
			if (
				(
					await this.deps.run(
						"/usr/bin/defaults",
						["read", DOMAIN, "activeModeKey"],
						{ timeoutMs: Math.ceil(ms) },
					)
				).trim() === originalMode
			)
				return;
			await this.deps.sleep(Math.min(100, ms));
		}
	}

	private async listRecordings(path: string): Promise<string[]> {
		try {
			return await this.deps.fs.readdir(path);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
			throw error;
		}
	}
}

export const superwhisper = new SuperwhisperAdapter(
	systemSuperwhisperDependencies,
);
