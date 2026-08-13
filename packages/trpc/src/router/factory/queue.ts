import type { SelectFactory, SelectFactoryItem } from "@superset/db/schema";
import { Client } from "@upstash/qstash";
import { env } from "../../env";
import { resolveUserRelayUrl } from "../../lib/relay-url";
import { dispatchFactoryStage } from "./dispatch";
import type { AgentStage } from "./stages";

let client: Client | null | undefined;
function qstash(): Client | null {
	if (client === undefined) {
		client = env.QSTASH_TOKEN
			? new Client({
					token: env.QSTASH_TOKEN,
					...(process.env.QSTASH_URL
						? { baseUrl: process.env.QSTASH_URL }
						: {}),
				})
			: null;
	}
	return client;
}

/**
 * Queue a stage dispatch through QStash so webhook handlers and agent
 * report calls return fast; workspace creation (25s+) happens in the
 * /api/factory/dispatch-stage worker. Falls back to inline dispatch when
 * QStash is unavailable (local dev), so behavior degrades to slower, not
 * broken. Dedup on (item, stage, revision) absorbs webhook retries.
 */
export async function dispatchStageQueued(args: {
	factory: SelectFactory;
	item: SelectFactoryItem;
	stage: AgentStage;
	expectedRevision: number;
}): Promise<"enqueued" | "dispatched-inline" | "failed"> {
	const q = qstash();
	if (q) {
		try {
			await q.publishJSON({
				url: `${env.NEXT_PUBLIC_API_URL}/api/factory/dispatch-stage`,
				body: {
					itemId: args.item.id,
					stage: args.stage,
					expectedRevision: args.expectedRevision,
				},
				deduplicationId: `${args.item.id}_${args.stage}_${args.expectedRevision}`,
				retries: 2,
			});
			return "enqueued";
		} catch (err) {
			console.error("[factory/queue] enqueue failed, dispatching inline:", err);
		}
	}
	try {
		await dispatchFactoryStage({
			factory: args.factory,
			item: args.item,
			stage: args.stage,
			expectedRevision: args.expectedRevision,
			relayUrl: await resolveUserRelayUrl(args.factory.ownerUserId),
		});
		return "dispatched-inline";
	} catch (err) {
		console.error("[factory/queue] inline dispatch failed:", err);
		return "failed";
	}
}
