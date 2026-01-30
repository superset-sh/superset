import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { createInterface } from "node:readline";
import type { PythonVoiceEvent, VoiceSidecarEvent } from "shared/voice";
import { getVoiceSpawnConfig } from "./voice-process-paths";

export const voiceProcessEmitter = new EventEmitter();

let childProcess: ChildProcess | null = null;
let isRunning = false;
let lastEvent: VoiceSidecarEvent = { type: "idle" };

function parsePythonEvent(raw: PythonVoiceEvent): VoiceSidecarEvent | null {
	switch (raw.event) {
		case "ready":
			return { type: "ready" };
		case "recording":
			return { type: "recording" };
		case "audio_captured":
			if (raw.audio_b64 && raw.duration_s !== undefined) {
				return {
					type: "audio_captured",
					audioB64: raw.audio_b64,
					durationS: raw.duration_s,
				};
			}
			return null;
		case "error":
			return { type: "error", message: raw.message ?? "Unknown error" };
		case "idle":
			return { type: "idle" };
		default:
			return null;
	}
}

export function startVoiceProcess(): void {
	if (childProcess) {
		console.warn("[voice-process] Already running");
		return;
	}

	const config = getVoiceSpawnConfig();

	console.log(
		`[voice-process] Starting: ${config.command} ${config.args.join(" ")}`,
	);

	const proc = spawn(config.command, config.args, {
		cwd: config.cwd,
		stdio: ["pipe", "pipe", "pipe"],
		env: { ...process.env },
	});

	childProcess = proc;
	isRunning = true;

	// Parse stdout JSON lines
	if (proc.stdout) {
		const rl = createInterface({ input: proc.stdout });
		rl.on("line", (line) => {
			try {
				const raw = JSON.parse(line) as PythonVoiceEvent;
				const event = parsePythonEvent(raw);
				if (event) {
					lastEvent = event;
					voiceProcessEmitter.emit("voice-event", event);
				}
			} catch {
				console.warn("[voice-process] Non-JSON stdout:", line);
			}
		});
	}

	// Log stderr
	if (proc.stderr) {
		const rl = createInterface({ input: proc.stderr });
		rl.on("line", (line) => {
			console.error("[voice-process/stderr]", line);
		});
	}

	// Only run cleanup if this process is still the active one.
	// A newer process may have been spawned after stopVoiceProcess()
	// cleared the reference.
	proc.on("error", (err) => {
		console.error("[voice-process] Spawn error:", err.message);
		voiceProcessEmitter.emit("voice-event", {
			type: "error",
			message: `Process error: ${err.message}`,
		} satisfies VoiceSidecarEvent);
		if (childProcess === proc) {
			cleanup();
		}
	});

	proc.on("exit", (code, signal) => {
		console.log(`[voice-process] Exited with code=${code} signal=${signal}`);
		if (childProcess === proc) {
			cleanup();
		}
	});
}

export function stopVoiceProcess(): void {
	if (!childProcess) {
		return;
	}

	// Capture reference and clear immediately so startVoiceProcess()
	// can proceed if called while this process is still shutting down.
	const proc = childProcess;
	cleanup();

	// Send stop command via stdin
	if (proc.stdin && !proc.stdin.destroyed) {
		try {
			proc.stdin.write(`${JSON.stringify({ cmd: "stop" })}\n`);
		} catch {
			// stdin may be closed already
		}
	}

	// Give it a moment to exit gracefully, then force kill
	const timeout = setTimeout(() => {
		if (!proc.killed) {
			proc.kill("SIGKILL");
		}
	}, 3000);

	proc.once("exit", () => {
		clearTimeout(timeout);
	});

	proc.kill("SIGTERM");
}

export function getVoiceProcessStatus(): {
	running: boolean;
} {
	return { running: isRunning };
}

export function getCurrentVoiceState(): VoiceSidecarEvent {
	return lastEvent;
}

function cleanup(): void {
	childProcess = null;
	isRunning = false;
	lastEvent = { type: "idle" };
	voiceProcessEmitter.emit("voice-event", lastEvent);
}
