import { timingSafeEqual } from "node:crypto";
import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import type { ActiveAgentStatus } from "@superset/shared/agent-status";
import { and, eq, ne } from "drizzle-orm";
import { nudge } from "../realtime";
import { sandboxHostSecretFor } from "./access";

export type ReportSandboxAgentStatusOutcome = "ok" | "unauthorized" | "unknown";

export async function reportSandboxAgentStatus(args: {
	workspaceId: string;
	presentedSecret: string;
	status: ActiveAgentStatus | null;
	at: number;
}): Promise<ReportSandboxAgentStatusOutcome> {
	const expected = Buffer.from(await sandboxHostSecretFor(args.workspaceId));
	const presented = Buffer.from(args.presentedSecret);
	if (
		expected.length !== presented.length ||
		!timingSafeEqual(expected, presented)
	) {
		return "unauthorized";
	}
	const [row] = await db
		.update(cloudWorkspaces)
		.set({ agentStatus: args.status, agentStatusAt: new Date(args.at) })
		.where(
			and(
				eq(cloudWorkspaces.id, args.workspaceId),
				ne(cloudWorkspaces.status, "deleted"),
			),
		)
		.returning({ organizationId: cloudWorkspaces.organizationId });
	if (!row) return "unknown";
	nudge(row.organizationId, "cloud_workspaces", {
		kind: "cloud_workspaces",
		workspaceId: args.workspaceId,
		agentStatus: args.status,
		agentStatusAt: args.at,
	});
	return "ok";
}
