import { constants, type Stats } from "node:fs";
import {
	type FileHandle,
	lstat,
	open,
	readdir,
	realpath,
} from "node:fs/promises";
import { homedir, platform, userInfo } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { TRPCError } from "@trpc/server";
import { parse as parseToml } from "smol-toml";
import type { SessionAccount } from "../usage/session-account/session-account";

const MAX_CONFIG_BYTES = 2 * 1024 * 1024;
const MAX_ANCESTORS = 64;
const MAX_MANAGED_FILES = 64;

// Settings can reintroduce these after env -u. Do not override organization
// policy or execute credential helpers to make an account selection succeed.
// https://code.claude.com/docs/en/env-vars
const CLAUDE_AUTH_ENV = new Set([
	"HOME",
	"USER",
	"LOGNAME",
	"XDG_CONFIG_HOME",
	"CLAUDE_CONFIG_DIR",
	"ANTHROPIC_API_KEY",
	"ANTHROPIC_AUTH_TOKEN",
	"ANTHROPIC_BASE_URL",
	"ANTHROPIC_CUSTOM_HEADERS",
	"CLAUDE_CODE_OAUTH_TOKEN",
	"CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR",
	"CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR",
	"CLAUDE_CODE_USE_BEDROCK",
	"CLAUDE_CODE_USE_VERTEX",
	"CLAUDE_CODE_USE_FOUNDRY",
	"CLAUDE_CODE_USE_ANTHROPIC_AWS",
	"CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST",
]);
const CLAUDE_AUTH_SETTINGS = [
	"apiKeyHelper",
	"awsAuthRefresh",
	"awsCredentialExport",
	"forceLoginOrgUUID",
	"forceLoginGatewayUrl",
	"gatewayInternalNetworks",
	"policyHelper",
];
const CODEX_AUTH_SETTINGS = [
	"model_providers",
	"profile",
	"profiles",
	"openai_base_url",
	"chatgpt_base_url",
	"forced_chatgpt_workspace_id",
];

function refuse(detail: string): never {
	throw new TRPCError({
		code: "PRECONDITION_FAILED",
		message: `Account selection cannot verify ${detail}. Use the agent's configured launch or resolve its authentication settings first. Nothing was launched.`,
	});
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissing(error: unknown): boolean {
	return isObject(error) && error.code === "ENOENT";
}

async function readConfig(path: string): Promise<string | undefined> {
	let file: FileHandle | undefined;
	try {
		// Nonblocking open also lets us reject a FIFO without waiting for a writer.
		file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
		const info = await file.stat();
		if (!info.isFile() || info.size > MAX_CONFIG_BYTES)
			refuse("a configuration file");
		const buffer = Buffer.alloc(MAX_CONFIG_BYTES + 1);
		let total = 0;
		while (total < buffer.length) {
			const { bytesRead } = await file.read(
				buffer,
				total,
				buffer.length - total,
				total,
			);
			if (bytesRead === 0) break;
			total += bytesRead;
		}
		if (total > MAX_CONFIG_BYTES) refuse("a configuration file");
		return buffer.toString("utf8", 0, total);
	} catch (error) {
		if (isMissing(error)) return undefined;
		// Parser and OS errors may contain credentials or entire config lines.
		refuse("a configuration file");
	} finally {
		await file?.close();
	}
}

async function validateFile(
	path: string,
	format: "json" | "toml",
): Promise<void> {
	const text = await readConfig(path);
	if (text === undefined) return;
	let config: unknown;
	try {
		config = format === "json" ? JSON.parse(text) : parseToml(text);
	} catch {
		refuse("a configuration file");
	}
	if (!isObject(config)) refuse("a configuration file");
	if (format === "json") {
		if (
			CLAUDE_AUTH_SETTINGS.some(
				(key) => config[key] !== undefined && config[key] !== null,
			)
		) {
			refuse("the Claude authentication configuration");
		}
		if (
			config.forceLoginMethod !== undefined &&
			config.forceLoginMethod !== "claudeai"
		) {
			refuse("the Claude login method");
		}
		if (config.env !== undefined) {
			if (!isObject(config.env)) refuse("the Claude environment settings");
			if (
				Object.keys(config.env).some(
					(key) =>
						CLAUDE_AUTH_ENV.has(key) || key.startsWith("CLAUDE_CODE_USE_"),
				)
			) {
				refuse("the Claude authentication environment");
			}
		}
	} else {
		// Reject alternate profiles/providers instead of trying to merge their
		// authentication precedence. Ordinary model, MCP and approval settings remain.
		// https://developers.openai.com/codex/config-reference
		if (
			CODEX_AUTH_SETTINGS.some((key) => config[key] !== undefined) ||
			(config.model_provider !== undefined &&
				config.model_provider !== "openai") ||
			(config.forced_login_method !== undefined &&
				config.forced_login_method !== "chatgpt") ||
			(config.cli_auth_credentials_store !== undefined &&
				config.cli_auth_credentials_store !== "file")
		) {
			refuse("the Codex authentication configuration");
		}
	}
}

async function projectDirectories(
	cwd: string,
	home: string,
): Promise<Set<string>> {
	const dirs = new Set<string>();
	let start: string;
	let homeDirectory: string;
	try {
		// A launched process resolves the physical cwd. Checking only the
		// symlink's parents can miss project settings in its actual checkout.
		start = await realpath(cwd);
		homeDirectory = await realpath(home);
	} catch {
		refuse("the project settings locations");
	}
	let current = start;
	for (let depth = 0; depth < MAX_ANCESTORS; depth++) {
		// The unselected system profile is not project configuration. Stop at
		// the home boundary unless the user actually launched in that folder.
		if (current === homeDirectory && current !== start) return dirs;
		dirs.add(current);
		const gitEntry = join(current, ".git");
		let info: Stats | undefined;
		try {
			info = await lstat(gitEntry);
		} catch (error) {
			if (!isMissing(error)) refuse("the project settings locations");
		}
		if (info?.isSymbolicLink()) refuse("the worktree settings locations");
		if (info?.isFile()) {
			const pointer = await readConfig(gitEntry);
			if (!pointer?.startsWith("gitdir: "))
				refuse("the worktree settings locations");
			const gitDir = resolve(current, pointer.slice(8).trim());
			const common = await readConfig(join(gitDir, "commondir"));
			if (common !== undefined) {
				const commonDir = resolve(gitDir, common.trim());
				if (basename(commonDir) !== ".git")
					refuse("the worktree settings locations");
				dirs.add(dirname(commonDir));
			}
		}
		if (info) return dirs;
		if (dirname(current) === current) return dirs;
		current = dirname(current);
	}
	refuse("the project settings locations");
}

interface RoutingOptions {
	/** Explicit locations keep synthetic tests away from real provider profiles. */
	homeDir?: string;
	os?: NodeJS.Platform;
	username?: string;
	systemDir?: string;
	managedPreferencesDir?: string;
}

async function refuseUnparsedPolicy(path: string): Promise<void> {
	try {
		await lstat(path);
	} catch (error) {
		if (isMissing(error)) return;
		refuse("managed authentication policy");
	}
	refuse("managed authentication policy");
}

/**
 * Local preflight only: checks known configuration sources without executing
 * helpers, changing policy, or claiming live authentication. Server-delivered
 * policy and later settings edits remain controlled by the provider itself.
 * https://code.claude.com/docs/en/settings
 * https://code.claude.com/docs/en/managed-settings
 */
export async function validateAccountAuthRouting(
	account: SessionAccount,
	cwd: string,
	options: RoutingOptions = {},
): Promise<void> {
	if (
		!account.directory ||
		!isAbsolute(account.directory) ||
		!isAbsolute(cwd)
	) {
		refuse("the selected profile location");
	}
	const os = options.os ?? platform();
	if (os !== "darwin" && os !== "linux")
		refuse("this platform's authentication policy");
	const home = options.homeDir ?? homedir();
	const roots = await projectDirectories(cwd, home);
	const files = new Set<string>();
	if (account.agent === "claude") {
		files.add(join(account.directory, "settings.json"));
		for (const root of roots) {
			files.add(join(root, ".claude", "settings.json"));
			files.add(join(root, ".claude", "settings.local.json"));
		}
		const systemDir =
			options.systemDir ??
			(os === "darwin"
				? "/Library/Application Support/ClaudeCode"
				: "/etc/claude-code");
		files.add(join(systemDir, "managed-settings.json"));
		let entries: string[];
		try {
			entries = await readdir(join(systemDir, "managed-settings.d"));
		} catch (error) {
			if (!isMissing(error)) refuse("managed authentication policy");
			entries = [];
		}
		if (entries.length > MAX_MANAGED_FILES)
			refuse("managed authentication policy");
		for (const entry of entries) {
			if (!entry.startsWith(".") && entry.endsWith(".json")) {
				files.add(join(systemDir, "managed-settings.d", entry));
			}
		}
	} else {
		files.add(join(account.directory, "config.toml"));
		for (const root of roots) files.add(join(root, ".codex", "config.toml"));
		const systemDir = options.systemDir ?? "/etc/codex";
		files.add(join(systemDir, "config.toml"));
		files.add(join(systemDir, "requirements.toml"));
		files.add(join(systemDir, "managed_config.toml"));
		files.add(join(account.directory, "managed_config.toml"));
	}
	if (os === "darwin") {
		const domain =
			account.agent === "claude"
				? "com.anthropic.claudecode"
				: "com.openai.codex";
		const managed =
			options.managedPreferencesDir ?? "/Library/Managed Preferences";
		const username = options.username ?? userInfo().username;
		await refuseUnparsedPolicy(join(managed, `${domain}.plist`));
		await refuseUnparsedPolicy(join(managed, username, `${domain}.plist`));
	}
	for (const file of files)
		await validateFile(file, account.agent === "claude" ? "json" : "toml");
}
