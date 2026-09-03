import { spawn } from "node:child_process";
import {
	getBuiltinAgentDefinition,
	isBuiltinAgentId,
	isTerminalAgentDefinition,
} from "@superset/shared/agent-catalog";
import { quoteSingleShell } from "@superset/shared/agent-prompt-launch";
import type { HostDb } from "../../../../db";
import { resolveHostAgentConfig } from "../../agents/agents";
import {
	buildHeadlessAgentCommand,
	HEADLESS_SMALL_MODELS,
} from "../../agents/headless-command";

/**
 * Headless one-shot commands that can run git and gh, per preset. The
 * catalog's `nonInteractiveCommand` is deliberately read-only for most CLIs
 * (plan modes, `--no-tools`) because workspace naming needs no tools; a PR
 * has to push and call `gh`, so only presets with a verified permission
 * bypass are listed. Anything else degrades to "open an agent terminal".
 */
export const HEADLESS_TOOL_COMMANDS: Record<string, string> = {
	claude: "claude --dangerously-skip-permissions -p",
	codex:
		"codex exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check",
	gemini: "gemini --skip-trust --approval-mode=yolo -p",
	copilot: "copilot --allow-all-tools -p",
};

/** Long enough for a push plus `gh pr create` on a slow network; the
 * renderer gives up on its own well before this. */
export const HEADLESS_CREATE_PR_TIMEOUT_MS = 10 * 60 * 1000;

/** Finished runs linger so a renderer that polled late still sees the
 * outcome, then drop out of memory. */
const FINISHED_RUN_TTL_MS = 30 * 60 * 1000;

const OUTPUT_TAIL_CHARS = 2_000;

export interface HeadlessCreatePrRun {
	workspaceId: string;
	presetId: string;
	startedAt: number;
	status: "running" | "succeeded" | "failed";
	finishedAt?: number;
	error?: string;
	outputTail?: string;
}

export interface HeadlessCreatePrCommand {
	presetId: string;
	label: string;
	command: string;
}

/**
 * Resolves `agent` (a host agent config id or a preset id) to a headless
 * command with tool access, or null when the preset has no known one.
 */
export function resolveHeadlessCreatePrCommand(
	db: HostDb,
	agent: string,
): HeadlessCreatePrCommand | null {
	const config = resolveHostAgentConfig(db, agent);
	const presetId = config?.presetId ?? agent;
	if (!isBuiltinAgentId(presetId)) return null;
	const definition = getBuiltinAgentDefinition(presetId);
	if (!isTerminalAgentDefinition(definition)) return null;
	const base = HEADLESS_TOOL_COMMANDS[presetId];
	if (!base) return null;
	return {
		presetId,
		label: config?.label ?? definition.label,
		command: buildHeadlessAgentCommand(
			presetId,
			base,
			HEADLESS_SMALL_MODELS[presetId],
		),
	};
}

const runs = new Map<string, HeadlessCreatePrRun>();

export function getHeadlessCreatePrRun(
	workspaceId: string,
): HeadlessCreatePrRun | null {
	const run = runs.get(workspaceId);
	if (!run) return null;
	if (
		run.status !== "running" &&
		run.finishedAt !== undefined &&
		Date.now() - run.finishedAt > FINISHED_RUN_TTL_MS
	) {
		runs.delete(workspaceId);
		return null;
	}
	return run;
}

export class HeadlessCreatePrAlreadyRunning extends Error {
	constructor(workspaceId: string) {
		super(`A headless create-PR run is already in progress for ${workspaceId}`);
		this.name = "HeadlessCreatePrAlreadyRunning";
	}
}

function tail(text: string): string {
	return text.length > OUTPUT_TAIL_CHARS
		? text.slice(-OUTPUT_TAIL_CHARS)
		: text;
}

/**
 * Spawns the agent CLI in the worktree with the prompt as its positional
 * argument and tracks the run per workspace. Returns as soon as the process
 * starts; `onFinished` fires when it exits or is killed for exceeding the
 * timeout. Login shell so the binary resolves the way it does in the user's
 * terminal (nvm/bun-global paths a GUI-launched host lacks); the host env is
 * passed through untouched so the CLI authenticates exactly as it would
 * there.
 */
export function startHeadlessCreatePr({
	workspaceId,
	presetId,
	command,
	prompt,
	cwd,
	timeoutMs = HEADLESS_CREATE_PR_TIMEOUT_MS,
	onFinished,
}: {
	workspaceId: string;
	presetId: string;
	command: string;
	prompt: string;
	cwd: string;
	timeoutMs?: number;
	onFinished?: (run: HeadlessCreatePrRun) => void;
}): HeadlessCreatePrRun {
	const existing = runs.get(workspaceId);
	if (existing?.status === "running") {
		throw new HeadlessCreatePrAlreadyRunning(workspaceId);
	}

	const run: HeadlessCreatePrRun = {
		workspaceId,
		presetId,
		startedAt: Date.now(),
		status: "running",
	};
	runs.set(workspaceId, run);

	const shell =
		process.env.SHELL ||
		(process.platform === "darwin" ? "/bin/zsh" : "/bin/bash");
	const child = spawn(
		shell,
		["-lc", `${command} ${quoteSingleShell(prompt)}`],
		{
			cwd,
			env: process.env,
			stdio: ["ignore", "pipe", "pipe"],
		},
	);

	let stdout = "";
	let stderr = "";
	let settled = false;
	const settle = (status: "succeeded" | "failed", error?: string) => {
		if (settled) return;
		settled = true;
		clearTimeout(timer);
		run.status = status;
		run.finishedAt = Date.now();
		run.outputTail = tail(stdout + (stderr ? `\n${stderr}` : ""));
		if (error) run.error = error;
		if (status === "failed") {
			console.warn(
				`[headless-create-pr] ${presetId} failed for ${workspaceId}: ${error}; output tail: ${run.outputTail}`,
			);
		}
		onFinished?.(run);
	};
	const timer = setTimeout(() => {
		child.kill("SIGKILL");
		settle("failed", `Timed out after ${Math.round(timeoutMs / 1000)}s`);
	}, timeoutMs);

	child.stdout.on("data", (chunk: Buffer) => {
		stdout = tail(stdout + chunk.toString());
	});
	child.stderr.on("data", (chunk: Buffer) => {
		stderr = tail(stderr + chunk.toString());
	});
	child.on("error", (error) => {
		settle("failed", `Could not start ${presetId}: ${error.message}`);
	});
	child.on("close", (code, signal) => {
		if (code === 0) settle("succeeded");
		else
			settle(
				"failed",
				`${presetId} exited with ${code ?? signal}${stderr.trim() ? `: ${tail(stderr).trim().split("\n").slice(-3).join(" ")}` : ""}`,
			);
	});

	return run;
}

/** Test seam: forget every tracked run. */
export function resetHeadlessCreatePrRunsForTests(): void {
	runs.clear();
}
