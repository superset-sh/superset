import { isAbsolute } from "node:path";
import {
	ensureClaudeManagedHooksAt,
	ensureCodexManagedHooksAt,
	resolveDisabledAgentIds,
} from "@superset/agent-setup";
import { buildArgvCommand } from "@superset/shared/agent-prompt-launch";
import { TRPCError } from "@trpc/server";
import type { ResolvedHostAgentConfig } from "../../../terminal-agents/agent-config";
import {
	discoverSessionAccounts,
	type SessionAccount,
	validateSessionAccount,
} from "../usage/session-account/session-account";

export interface LaunchAccountChoice {
	selection: string | null;
	identity: string;
}

const AUTH_ENV = {
	claude: [
		"CLAUDE_CONFIG_DIR",
		"SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR",
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
	],
	codex: [
		"CODEX_HOME",
		"SUPERSET_DEFAULT_CODEX_HOME",
		"OPENAI_API_KEY",
		"OPENAI_BASE_URL",
		"CODEX_API_KEY",
	],
} as const;

const LAUNCH_ENV_OVERRIDES = new Set([
	"HOME",
	"USER",
	"LOGNAME",
	"XDG_CONFIG_HOME",
	"PATH",
	"BASH_ENV",
	"ENV",
	"ZDOTDIR",
]);

// Limit explicit selection to the stock preset flags. Arbitrary provider flags
// can change authentication, the configuration root, or the server being used.
const ACCOUNT_LAUNCH_ARGS = {
	claude: new Set(["--dangerously-skip-permissions"]),
	codex: new Set([
		"--dangerously-bypass-approvals-and-sandbox",
		"--dangerously-bypass-hook-trust",
	]),
};

export function accountLaunchUnsupportedReason(
	config: ResolvedHostAgentConfig,
): string | undefined {
	const provider = config.presetId;
	if (
		(provider !== "claude" && provider !== "codex") ||
		config.command !== provider
	) {
		return "Account selection requires the built-in Claude or Codex command.";
	}
	if (
		config.promptTransport !== "argv" ||
		config.args.some((arg) => !ACCOUNT_LAUNCH_ARGS[provider].has(arg)) ||
		!(
			config.promptArgs.length === 0 ||
			(provider === "codex" &&
				config.promptArgs.length === 1 &&
				config.promptArgs[0] === "--")
		) ||
		config.resumeArgs.length !== 1 ||
		config.resumeArgs[0] !== (provider === "claude" ? "--resume" : "resume")
	) {
		return "This agent has custom launch settings. Use its configured account instead.";
	}
	if (
		Object.keys(config.env).some(
			(key) =>
				(AUTH_ENV[provider] as readonly string[]).includes(key) ||
				LAUNCH_ENV_OVERRIDES.has(key) ||
				(provider === "claude" && key.startsWith("CLAUDE_CODE_USE_")) ||
				key.startsWith("SUPERSET_"),
		)
	) {
		return "This agent has an account or authentication override in its environment.";
	}
	return undefined;
}

function selectableAccount(account: SessionAccount): boolean {
	return (
		account.credentialKind === "subscription" &&
		(account.selection === null || account.selection === account.directory) &&
		Boolean(
			account.directory &&
				isAbsolute(account.directory) &&
				// These values are typed into an interactive shell, where control bytes
				// can submit a line before normal shell quoting has a chance to apply.
				// biome-ignore lint/suspicious/noControlCharactersInRegex: reject terminal control bytes
				!/[\x00-\x1f\x7f-\x9f]/.test(account.directory),
		) &&
		Boolean(account.email)
	);
}

export async function listLaunchAccounts(
	config: ResolvedHostAgentConfig,
	discover = discoverSessionAccounts,
) {
	const reason = accountLaunchUnsupportedReason(config);
	if (reason) return { supported: false, accounts: [], reason };
	const accounts = await discover(config.presetId as "claude" | "codex");
	return {
		supported: true,
		accounts: accounts.filter(selectableAccount).map((account) => ({
			selection: account.selection,
			identity: account.identity,
			email: account.email as string,
			label: account.selection ?? "System account",
		})),
	};
}

/** Resolve only a current, discovered profile; client-supplied paths are never trusted. */
export async function resolveLaunchAccount(
	config: ResolvedHostAgentConfig,
	choice: LaunchAccountChoice,
	discover = discoverSessionAccounts,
): Promise<SessionAccount> {
	const reason = accountLaunchUnsupportedReason(config);
	if (reason) throw new TRPCError({ code: "BAD_REQUEST", message: reason });
	const accounts = await discover(config.presetId as "claude" | "codex");
	const account = accounts.find(
		(candidate) =>
			candidate.selection === choice.selection &&
			candidate.identity === choice.identity &&
			selectableAccount(candidate),
	);
	if (!account)
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"The selected account is no longer available or its sign-in changed. Refresh the account list and choose again.",
		});
	return { ...account, pinned: true };
}

export async function validatePinnedLaunchAccount(
	config: ResolvedHostAgentConfig,
	account: SessionAccount,
	deps: {
		validate?: typeof validateSessionAccount;
		discover?: typeof discoverSessionAccounts;
	} = {},
): Promise<void> {
	const reason = accountLaunchUnsupportedReason(config);
	if (
		reason ||
		!account.pinned ||
		account.conflict ||
		account.agent !== config.presetId ||
		!selectableAccount(account) ||
		!(await (deps.validate ?? validateSessionAccount)(account))
	) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				reason ??
				"The saved account is unavailable or its sign-in changed. Nothing was launched.",
		});
	}
	const current = await resolveLaunchAccount(
		config,
		account,
		deps.discover ?? discoverSessionAccounts,
	);
	if (current.directory !== account.directory)
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"The saved account's profile location changed. Nothing was launched.",
		});
}

export function pinnedAccountEnv(
	account: SessionAccount,
): Record<string, string> {
	if (account.agent === "claude") {
		// Unset is significant: Claude's system keychain identity differs from
		// the one selected by explicitly exporting the same ~/.claude path.
		return account.selection === null
			? {}
			: { CLAUDE_CONFIG_DIR: account.directory as string };
	}
	return {
		CODEX_HOME: account.directory as string,
		SUPERSET_DEFAULT_CODEX_HOME: account.directory as string,
	};
}

export function pinnedAccountCommandPrefix(
	account: SessionAccount,
	env: Record<string, string>,
): string {
	const variable =
		account.agent === "claude" ? "CLAUDE_CONFIG_DIR" : "CODEX_HOME";
	return `${buildArgvCommand([
		"env",
		...AUTH_ENV[account.agent].flatMap((key) => ["-u", key]),
		...Object.entries({
			...env,
			...pinnedAccountEnv(account),
			SUPERSET_PINNED_ACCOUNT: variable,
		}).map(([key, value]) => `${key}=${value}`),
	])} `;
}

/** Prepare lifecycle tracking without changing login, default selection or history. */
export function prepareLaunchAccountHooks(account: SessionAccount): void {
	const directory = account.directory;
	if (!account.pinned || !directory)
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"The selected account cannot prepare its hooks. Nothing was launched.",
		});
	if (resolveDisabledAgentIds().includes(account.agent)) return;
	const prepared =
		account.agent === "claude"
			? ensureClaudeManagedHooksAt(directory)
			: ensureCodexManagedHooksAt(directory);
	if (!prepared)
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"The selected account's hooks could not be prepared. Fix its settings before launching.",
		});
}
