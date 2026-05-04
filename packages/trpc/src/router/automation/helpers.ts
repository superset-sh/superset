import { createHash } from "node:crypto";
import { db, type dbWs } from "@superset/db/client";
import {
	type AutomationPromptSource,
	automationPromptVersions,
	automations,
} from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";

const PROMPT_VERSION_BUCKET_SECONDS = 600;

export function computePromptHash(prompt: string): string {
	return createHash("sha256").update(prompt).digest("hex");
}

export function currentPromptWindowBucket(): number {
	return Math.floor(Date.now() / 1000 / PROMPT_VERSION_BUCKET_SECONDS);
}

export function promptSourceFromSession(session: {
	session: { userAgent: string | null };
}): AutomationPromptSource {
	return session.session.userAgent === "mcp-v2" ? "agent" : "human";
}

export type AutomationDbExecutor =
	| typeof dbWs
	| Parameters<Parameters<typeof dbWs.transaction>[0]>[0];

export async function recordPromptVersion(
	tx: AutomationDbExecutor,
	params: {
		automationId: string;
		authorUserId: string;
		content: string;
		source: AutomationPromptSource;
		restoredFromVersionId?: string | null;
	},
) {
	const contentHash = computePromptHash(params.content);
	const windowBucket = currentPromptWindowBucket();

	const insert = tx.insert(automationPromptVersions).values({
		automationId: params.automationId,
		authorUserId: params.authorUserId,
		windowBucket,
		content: params.content,
		contentHash,
		source: params.source,
		restoredFromVersionId: params.restoredFromVersionId ?? null,
	});

	if (params.source === "restore") {
		const [row] = await insert.returning();
		return row;
	}

	const [row] = await insert
		.onConflictDoUpdate({
			target: [
				automationPromptVersions.automationId,
				automationPromptVersions.authorUserId,
				automationPromptVersions.windowBucket,
			],
			targetWhere: sql`${automationPromptVersions.source} <> 'restore'`,
			set: {
				content: sql`excluded.content`,
				contentHash: sql`excluded.content_hash`,
				source: sql`excluded.source`,
				updatedAt: sql`now()`,
			},
		})
		.returning();
	return row;
}

export async function getAutomationForUser(
	userId: string,
	organizationId: string,
	id: string,
) {
	const [automation] = await db
		.select()
		.from(automations)
		.where(
			and(
				eq(automations.id, id),
				eq(automations.organizationId, organizationId),
			),
		)
		.limit(1);

	if (!automation || automation.ownerUserId !== userId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Automation not found",
		});
	}

	return automation;
}
