import { realpath } from "node:fs/promises";
import type {
	ChatAccountSelection,
	ChatLaunchAccount,
	ChatLaunchContext,
} from "@superset/chat/protocol";
import { eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { workspaces } from "../db/schema";
import { validateAccountAuthRouting } from "../trpc/router/agents/account-auth-routing";
import { resolveProviderLaunchAccount } from "../trpc/router/agents/launch-account";
import type { SessionAccount } from "../trpc/router/usage/session-account/session-account";

export const ACCOUNT_CHAT_HARNESSES = ["claude-acp", "codex-acp"] as const;

function providerForHarness(harness: string): "claude" | "codex" {
	if (harness === "claude-acp") return "claude";
	if (harness === "codex-acp") return "codex";
	throw new Error(
		"This chat agent does not support explicit account selection.",
	);
}

export function sessionAccountForChat(
	account: ChatLaunchAccount,
): SessionAccount {
	return { ...account, credentialKind: "subscription", pinned: true };
}

export async function prepareChatAccount(
	input: { harness: string; account: ChatAccountSelection; cwd: string },
	deps = {
		resolve: resolveProviderLaunchAccount,
		validateRouting: validateAccountAuthRouting,
	},
): Promise<ChatLaunchAccount> {
	if (process.env.SUPERSET_HOST_RUN_MODE === "sandbox")
		throw new Error(
			"Explicit local accounts are not available in this cloud workspace.",
		);
	const account = await deps.resolve(
		providerForHarness(input.harness),
		input.account,
	);
	await deps.validateRouting(account, input.cwd);
	if (!account.directory)
		throw new Error("The selected account profile is unavailable.");
	return {
		agent: account.agent,
		selection: account.selection,
		identity: account.identity,
		directory: account.directory,
	};
}

export async function validateChatAccount(
	db: HostDb,
	context: ChatLaunchContext,
	harness: string,
	scopeId: string,
): Promise<void> {
	const workspace = db.query.workspaces
		.findFirst({ where: eq(workspaces.id, scopeId) })
		.sync();
	if (
		!workspace ||
		workspace.archivedAt !== null ||
		(await realpath(workspace.worktreePath)) !== (await realpath(context.cwd))
	)
		throw new Error(
			"The conversation's working folder is unavailable or changed.",
		);
	const account = await prepareChatAccount({
		harness,
		account: context.account,
		cwd: context.cwd,
	});
	if (
		account.agent !== context.account.agent ||
		account.directory !== context.account.directory
	)
		throw new Error("The saved account profile changed. Nothing was launched.");
}
