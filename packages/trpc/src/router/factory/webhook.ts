import { db, dbWs } from "@superset/db/client";
import {
	factories,
	factoryItems,
	factoryRuns,
	githubInstallations,
	type SelectFactory,
} from "@superset/db/schema";
import { and, eq, max, sql } from "drizzle-orm";
import { dispatchStageQueued } from "./queue";

/**
 * GitHub webhook → factory intake. Called from apps/api's webhook receiver;
 * must never throw (a bad delivery should not fail the whole webhook).
 */

async function factoriesForRepo(
	installationId: number,
	repoFullName: string,
): Promise<SelectFactory[]> {
	const [installation] = await db
		.select({ organizationId: githubInstallations.organizationId })
		.from(githubInstallations)
		.where(eq(githubInstallations.installationId, String(installationId)))
		.limit(1);
	if (!installation) return [];

	return db
		.select()
		.from(factories)
		.where(
			and(
				eq(factories.organizationId, installation.organizationId),
				eq(factories.enabled, true),
				sql`lower(${factories.repoFullName}) = lower(${repoFullName})`,
			),
		);
}

export async function handleFactoryIssueOpened(args: {
	installationId: number;
	repoFullName: string;
	issue: { number: number; title: string; url: string; authorLogin?: string };
}): Promise<void> {
	try {
		const targets = await factoriesForRepo(
			args.installationId,
			args.repoFullName,
		);
		for (const factory of targets) {
			// Same key convention as manual intake — webhook/poll/paste races
			// all collapse into one item.
			const [item] = await dbWs
				.insert(factoryItems)
				.values({
					factoryId: factory.id,
					organizationId: factory.organizationId,
					source: "github_issue",
					externalNumber: args.issue.number,
					externalUrl: args.issue.url,
					title: args.issue.title,
					authorLogin: args.issue.authorLogin ?? null,
					materializationKey: `repo:${factory.repoFullName}:github_issue:${args.issue.number}`,
				})
				.onConflictDoNothing({
					target: [factoryItems.factoryId, factoryItems.materializationKey],
				})
				.returning();

			if (item && factory.autoAdvance) {
				await dispatchStageQueued({
					factory,
					item,
					stage: "classify",
					expectedRevision: item.revision,
				});
			}
		}
	} catch (err) {
		console.error("[factory/webhook] issue intake failed:", err);
	}
}

/**
 * Merged factory PR → the human gate opens: advance the matching item from
 * human_review to verify (recorded as a manual ledger row), and dispatch
 * the verify agent when autoAdvance is on.
 */
export async function handleFactoryPrMerged(args: {
	installationId: number;
	repoFullName: string;
	prNumber: number;
}): Promise<void> {
	try {
		const targets = await factoriesForRepo(
			args.installationId,
			args.repoFullName,
		);
		for (const factory of targets) {
			const [item] = await db
				.select()
				.from(factoryItems)
				.where(
					and(
						eq(factoryItems.factoryId, factory.id),
						eq(factoryItems.prNumber, args.prNumber),
						eq(factoryItems.stage, "human_review"),
					),
				)
				.limit(1);
			if (!item) continue;

			const [moved] = await dbWs
				.update(factoryItems)
				.set({
					stage: "verify",
					stageEnteredAt: new Date(),
					blockedReason: null,
					revision: sql`${factoryItems.revision} + 1`,
				})
				.where(
					and(
						eq(factoryItems.id, item.id),
						eq(factoryItems.revision, item.revision),
					),
				)
				.returning({ revision: factoryItems.revision });
			if (!moved) continue; // raced a human move; the webhook retries or the human won

			const [latest] = await db
				.select({ attempt: max(factoryRuns.attempt) })
				.from(factoryRuns)
				.where(
					and(eq(factoryRuns.itemId, item.id), eq(factoryRuns.stage, "verify")),
				);
			await dbWs.insert(factoryRuns).values({
				itemId: item.id,
				factoryId: factory.id,
				organizationId: factory.organizationId,
				stage: "verify",
				attempt: (latest?.attempt ?? 0) + 1,
				status: "reported",
				outcome: "manual",
				rationale: `PR #${args.prNumber} merged (webhook) — advancing to verify`,
				reportedAt: new Date(),
			});

			if (factory.autoAdvance) {
				const [fresh] = await db
					.select()
					.from(factoryItems)
					.where(eq(factoryItems.id, item.id))
					.limit(1);
				if (fresh) {
					await dispatchStageQueued({
						factory,
						item: fresh,
						stage: "verify",
						expectedRevision: fresh.revision,
					});
				}
			}
		}
	} catch (err) {
		console.error("[factory/webhook] pr-merged handling failed:", err);
	}
}
