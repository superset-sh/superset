import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, delimiter, dirname, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { protectedProcedure } from "../../index";
import { requireLocalProject } from "./shared/local-project";

const execFileAsync = promisify(execFile);

export const trellisStatusStateSchema = z.enum([
	"ready",
	"missing",
	"partial",
	"unavailable",
]);

export type TrellisStatusState = z.infer<typeof trellisStatusStateSchema>;

export interface TrellisStatus {
	state: TrellisStatusState;
	hasTrellis: boolean;
	configPath: string | null;
	version: string | null;
	message: string;
}

export interface TrellisSetupResult extends TrellisStatus {
	initialized: boolean;
	warning: string | null;
}

export const trellisPlatformSchema = z.enum([
	"claude",
	"cursor",
	"codex",
	"gemini",
	"opencode",
	"pi",
	"copilot",
	"droid",
]);

export type TrellisPlatform = z.infer<typeof trellisPlatformSchema>;

const TRELLIS_PLATFORM_FLAGS: Record<TrellisPlatform, string> = {
	claude: "--claude",
	cursor: "--cursor",
	codex: "--codex",
	gemini: "--gemini",
	opencode: "--opencode",
	pi: "--pi",
	copilot: "--copilot",
	droid: "--droid",
};

const TRELLIS_PLATFORM_BY_AGENT: Record<string, TrellisPlatform> = {
	claude: "claude",
	cursor: "cursor",
	"cursor-agent": "cursor",
	codex: "codex",
	gemini: "gemini",
	opencode: "opencode",
	"open-code": "opencode",
	pi: "pi",
	copilot: "copilot",
	droid: "droid",
};

export interface TrellisCommandArgs {
	command: string;
	args: string[];
	cwd: string;
	timeoutMs: number;
}

export type TrellisCommandRunner = (
	args: TrellisCommandArgs,
) => Promise<{ stdout: string; stderr: string }>;

export function resolveTrellisPlatformsFromAgents(
	agents: readonly string[] | undefined,
): TrellisPlatform[] {
	const platforms = new Set<TrellisPlatform>();

	for (const agent of agents ?? []) {
		const normalized = agent.trim().toLowerCase().replaceAll("_", "-");
		const platform = TRELLIS_PLATFORM_BY_AGENT[normalized];
		if (platform) {
			platforms.add(platform);
		}
	}

	return Array.from(platforms);
}

function buildTrellisInitArgs(platforms: readonly TrellisPlatform[]): string[] {
	const flags = new Set<string>();
	for (const platform of platforms) {
		flags.add(TRELLIS_PLATFORM_FLAGS[platform]);
	}
	return ["init", "--yes", "--skip-existing", ...flags];
}

function executableName(name: "bun" | "node"): string {
	return process.platform === "win32" ? `${name}.exe` : name;
}

export function canRunNodeEntrypoint(execPath: string): boolean {
	const name = basename(execPath).toLowerCase();
	return (
		name === "bun" ||
		name === "bun.exe" ||
		name === "node" ||
		name === "node.exe"
	);
}

async function isExecutablePath(path: string): Promise<boolean> {
	try {
		await access(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

async function resolveExecutable(
	name: "bun" | "node",
	extraCandidates: Array<string | undefined> = [],
): Promise<string | null> {
	const binaryName = executableName(name);
	const pathCandidates = (process.env.PATH ?? "")
		.split(delimiter)
		.filter(Boolean)
		.map((entry) => join(entry, binaryName));
	const candidates = [...extraCandidates, ...pathCandidates, binaryName].filter(
		(candidate): candidate is string => Boolean(candidate),
	);

	for (const candidate of candidates) {
		if (!isAbsolute(candidate)) continue;
		if (await isExecutablePath(candidate)) {
			return candidate;
		}
	}

	return null;
}

export async function resolveTrellisRuntimeCommand(): Promise<string> {
	if (canRunNodeEntrypoint(process.execPath)) {
		return process.execPath;
	}

	const bun = await resolveExecutable("bun", [
		process.env.BUN_EXECUTABLE,
		process.env.BUN_INSTALL
			? join(process.env.BUN_INSTALL, "bin", executableName("bun"))
			: undefined,
	]);
	if (bun) return bun;

	const node = await resolveExecutable("node");
	if (node) return node;

	throw new Error(
		"Unable to find Bun or Node.js to run the repo-local Trellis CLI. Electron cannot execute Trellis bin scripts directly.",
	);
}

function isNodeErrno(error: unknown, code: string): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === code
	);
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch (error) {
		if (isNodeErrno(error, "ENOENT")) return false;
		throw error;
	}
}

async function isDirectory(path: string): Promise<boolean> {
	try {
		const entry = await stat(path);
		return entry.isDirectory();
	} catch (error) {
		if (isNodeErrno(error, "ENOENT")) return false;
		throw error;
	}
}

async function readTrimmed(path: string): Promise<string | null> {
	try {
		const text = await readFile(path, "utf8");
		const trimmed = text.trim();
		return trimmed || null;
	} catch (error) {
		if (isNodeErrno(error, "ENOENT")) return null;
		throw error;
	}
}

export async function getTrellisStatusAtPath(
	repoPath: string,
): Promise<TrellisStatus> {
	const trellisDir = join(repoPath, ".trellis");
	const configPath = join(trellisDir, "config.yaml");
	const tasksPath = join(trellisDir, "tasks");
	const versionPath = join(trellisDir, ".version");

	try {
		if (!(await isDirectory(trellisDir))) {
			return {
				state: "missing",
				hasTrellis: false,
				configPath: null,
				version: null,
				message: "Trellis is not initialized for this repository.",
			};
		}

		const [hasConfig, hasTasks, version] = await Promise.all([
			pathExists(configPath),
			isDirectory(tasksPath),
			readTrimmed(versionPath),
		]);

		if (hasConfig && hasTasks) {
			return {
				state: "ready",
				hasTrellis: true,
				configPath,
				version,
				message: version ? `Trellis ${version} is ready.` : "Trellis is ready.",
			};
		}

		return {
			state: "partial",
			hasTrellis: true,
			configPath: hasConfig ? configPath : null,
			version,
			message:
				"Trellis files exist, but the setup looks incomplete. Workspace creation will not overwrite it.",
		};
	} catch (error) {
		return {
			state: "unavailable",
			hasTrellis: false,
			configPath: null,
			version: null,
			message:
				error instanceof Error
					? error.message
					: "Unable to inspect Trellis setup.",
		};
	}
}

function resolveTrellisBinPath(): string {
	const require = createRequire(import.meta.url);
	const packageJsonPath = require.resolve("@mindfoldhq/trellis/package.json");
	return join(dirname(packageJsonPath), "bin", "trellis.js");
}

async function defaultTrellisCommandRunner(
	args: TrellisCommandArgs,
): Promise<{ stdout: string; stderr: string }> {
	const result = await execFileAsync(args.command, args.args, {
		cwd: args.cwd,
		timeout: args.timeoutMs,
		maxBuffer: 1024 * 1024,
		env: {
			...process.env,
			CI: "1",
		},
	});
	return {
		stdout: result.stdout,
		stderr: result.stderr,
	};
}

function errorMessageWithOutput(error: unknown): string {
	if (error instanceof Error) {
		const maybeOutput = error as Error & {
			stderr?: unknown;
			stdout?: unknown;
		};
		const stderr =
			typeof maybeOutput.stderr === "string" ? maybeOutput.stderr.trim() : "";
		const stdout =
			typeof maybeOutput.stdout === "string" ? maybeOutput.stdout.trim() : "";
		return [error.message, stderr, stdout].filter(Boolean).join("\n");
	}
	return String(error);
}

export async function applyTrellisSetup(args: {
	worktreePath: string;
	initialize: boolean;
	platforms?: readonly TrellisPlatform[];
	runner?: TrellisCommandRunner;
	trellisBinPath?: string;
	timeoutMs?: number;
}): Promise<TrellisSetupResult> {
	const before = await getTrellisStatusAtPath(args.worktreePath);

	if (!args.initialize) {
		return {
			...before,
			initialized: false,
			warning: null,
		};
	}

	if (before.state === "ready") {
		return {
			...before,
			initialized: false,
			warning: null,
		};
	}

	if (before.state !== "missing") {
		return {
			...before,
			initialized: false,
			warning:
				"Trellis setup was requested, but existing Trellis files were left untouched.",
		};
	}

	const platforms = args.platforms ?? [];
	if (platforms.length === 0) {
		return {
			...before,
			initialized: false,
			warning:
				"Guided workflow setup was requested, but no supported Agent platform was selected. Select Claude, Codex, Gemini, OpenCode, Cursor Agent, Copilot, Droid, or Pi to write matching workflow adapter files.",
		};
	}

	try {
		const runner = args.runner ?? defaultTrellisCommandRunner;
		const trellisBinPath = args.trellisBinPath ?? resolveTrellisBinPath();
		const runtimeCommand = await resolveTrellisRuntimeCommand();
		await runner({
			command: runtimeCommand,
			args: [trellisBinPath, ...buildTrellisInitArgs(platforms)],
			cwd: args.worktreePath,
			timeoutMs: args.timeoutMs ?? 120_000,
		});

		const after = await getTrellisStatusAtPath(args.worktreePath);
		return {
			...after,
			initialized: after.hasTrellis,
			warning: after.hasTrellis
				? null
				: "Trellis init completed, but .trellis was not detected afterward.",
		};
	} catch (error) {
		return {
			...before,
			initialized: false,
			warning: `Trellis initialization failed: ${errorMessageWithOutput(error)}`,
		};
	}
}

export const getTrellisStatus = protectedProcedure
	.input(z.object({ projectId: z.string().uuid() }))
	.query(async ({ ctx, input }) => {
		const localProject = requireLocalProject(ctx, input.projectId);
		return getTrellisStatusAtPath(localProject.repoPath);
	});
