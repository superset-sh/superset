import { TRPCError } from "@trpc/server";
import type { TRPCContext } from "../../trpc";

// Split from the router so the unit tests can reach these without importing
// `@superset/db/client`, which opens a `neon()` connection at module scope and
// throws in CI, where DATABASE_URL is unset. Same reason `page/access.ts` and
// `page/publish-rules.ts` sit beside their router rather than inside it.

/**
 * The session id to record for a write, or null if a human is writing.
 *
 * Two sources, and they are not equally trustworthy. An MCP call is
 * authoritative — that transport carries nothing but agents, and `agentCaller`
 * is set from it rather than from the body. A CLI agent self-reports via
 * `agentSessionId`, and the server cannot check it: `superset` presents the
 * user's own credential whether a human or an agent in a pane invoked it.
 *
 * So a comment marked `agent` is proof for MCP and a claim for the CLI. That
 * is enough for attribution, which is what author_kind is for. It is NOT a
 * security boundary: an org member who can reach this procedure can already
 * reply as themselves, and can dress that reply up as an agent by sending an
 * agentSessionId. Closing that would take giving agent sessions their own
 * credential, which is a broader auth change than this router.
 */
export function agentSessionFor(
	ctx: TRPCContext,
	claimed?: string | undefined,
): string | null {
	if (ctx.agentCaller) {
		return `mcp:${ctx.agentCaller.label ?? "unknown"}`;
	}
	return claimed ?? null;
}

/**
 * Agents answer threads they were handed, not every thread they can see.
 * A person activates a thread from the page UI; until then this refuses the
 * write. Republishing clears activation, since a new version is not what
 * anyone agreed to.
 */
export function assertActivatedForAgent(
	thread: { agentActivatedAt: Date | null },
	agentSession: string | null,
): void {
	if (!agentSession) return;
	if (thread.agentActivatedAt !== null) return;
	throw new TRPCError({
		code: "FORBIDDEN",
		message:
			"This thread has not been handed to an agent. Someone has to hand it off from the page first.",
	});
}
