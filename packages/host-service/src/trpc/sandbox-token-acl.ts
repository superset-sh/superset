import { eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { terminalSessions } from "../db/schema";

/**
 * Authorization policy for requests authenticated with a per-workspace sandbox
 * CLI token (as opposed to the host PSK).
 *
 * The threat: the token is readable by the untrusted agent inside the
 * container. Without scoping, it authenticates like the PSK and can drive the
 * whole host-service API — create host-run session/workspaces (host RCE),
 * read arbitrary host files, steal provider credentials, act on other
 * workspaces (CWE-862). So sandbox tokens are DEFAULT-DENY: only the
 * operations below, each scoped to the token's OWN workspace, are permitted.
 *
 * Deliberately NOT permitted (all can execute on the host or cross workspaces):
 * any workspace/session creation, filesystem.*, auth.*, settings.*, project.*,
 * github.*, host.*, usage.*, and cross-workspace terminal/agent operations.
 * Cross-workspace orchestration must run from a trusted (PSK) context.
 */

type ScopeResolver = (
	rawInput: unknown,
	db: HostDb,
) => string | undefined | Promise<string | undefined>;

function readStringField(rawInput: unknown, field: string): string | undefined {
	if (rawInput && typeof rawInput === "object" && field in rawInput) {
		const value = (rawInput as Record<string, unknown>)[field];
		return typeof value === "string" ? value : undefined;
	}
	return undefined;
}

const byWorkspaceId: ScopeResolver = (rawInput) =>
	readStringField(rawInput, "workspaceId");

const byTerminalId: ScopeResolver = (rawInput, db) => {
	const terminalId = readStringField(rawInput, "terminalId");
	if (!terminalId) return undefined;
	const row = db
		.select({ workspaceId: terminalSessions.originWorkspaceId })
		.from(terminalSessions)
		.where(eq(terminalSessions.id, terminalId))
		.get();
	return row?.workspaceId ?? undefined;
};

/**
 * Allowed procedure paths → how to resolve the workspace the call targets.
 * A path absent here is denied outright for sandbox principals.
 */
const SANDBOX_TOKEN_ACL: Record<string, ScopeResolver> = {
	// Manage the token's own workspace terminals.
	"terminal.list": byWorkspaceId,
	"terminal.send": byTerminalId,
	"terminal.snapshot": byTerminalId,
	"terminal.killSession": byTerminalId,
	"terminal.writeInput": byTerminalId,
	"terminal.hasRunningProcess": byTerminalId,
	// Launch an agent in the token's own (already sandboxed) workspace.
	"agents.run": byWorkspaceId,
	// Import the token's own sandbox commits into its worktree.
	"workspaces.syncSandbox": byWorkspaceId,
};

export interface SandboxAclDecision {
	allowed: boolean;
	reason?: string;
}

/**
 * WebSocket authorization for a sandbox-token principal. Only the token's own
 * workspace terminals may be attached to or deleted; host-scoped socket routes
 * (/events, /chat-v3, /browser) and session creation/listing are denied.
 */
export function checkSandboxWsAccess(args: {
	path: string;
	tokenWorkspaceId: string;
	db: HostDb;
}): SandboxAclDecision {
	const { path } = args;
	if (!path.startsWith("/terminal/")) {
		return { allowed: false, reason: "host-scoped socket route" };
	}
	// Create + list-all are host operations; never via a sandbox token.
	if (path === "/terminal/sessions" || path === "/terminal/resource-sessions") {
		return { allowed: false, reason: "session create/list not permitted" };
	}
	// /terminal/sessions/:terminalId (delete) or /terminal/:terminalId (attach)
	const deleteMatch = path.match(/^\/terminal\/sessions\/([^/]+)$/);
	const attachMatch = path.match(/^\/terminal\/([^/]+)$/);
	const terminalId =
		deleteMatch?.[1] ??
		(attachMatch && attachMatch[1] !== "sessions" ? attachMatch[1] : undefined);
	if (!terminalId) {
		return { allowed: false, reason: "unrecognized terminal route" };
	}
	const row = args.db
		.select({ workspaceId: terminalSessions.originWorkspaceId })
		.from(terminalSessions)
		.where(eq(terminalSessions.id, terminalId))
		.get();
	if (!row?.workspaceId) {
		return { allowed: false, reason: "terminal not found" };
	}
	if (row.workspaceId !== args.tokenWorkspaceId) {
		return { allowed: false, reason: "cross-workspace access denied" };
	}
	return { allowed: true };
}

export async function checkSandboxTokenAccess(args: {
	path: string;
	rawInput: unknown;
	tokenWorkspaceId: string;
	db: HostDb;
}): Promise<SandboxAclDecision> {
	const resolver = SANDBOX_TOKEN_ACL[args.path];
	if (!resolver) {
		return { allowed: false, reason: "not permitted for a sandbox token" };
	}
	const target = await resolver(args.rawInput, args.db);
	if (!target) {
		// Fail closed: a scoped procedure we can't pin to a workspace is denied.
		return { allowed: false, reason: "workspace scope could not be resolved" };
	}
	if (target !== args.tokenWorkspaceId) {
		return { allowed: false, reason: "cross-workspace access denied" };
	}
	return { allowed: true };
}
