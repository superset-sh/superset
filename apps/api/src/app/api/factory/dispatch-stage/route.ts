import { dbWs } from "@superset/db/client";
import { factories, factoryItems } from "@superset/db/schema";
import { dispatchFactoryStage } from "@superset/trpc/factory-dispatch";
import { Receiver } from "@upstash/qstash";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";
import { getRelayUrl } from "@/lib/relay-url";

// Workspace creation on big repos takes real time.
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

const payloadSchema = z.object({
	itemId: z.string().uuid(),
	stage: z.enum(["classify", "analyze", "implement", "review", "verify"]),
	expectedRevision: z.number().int().nonnegative(),
});

export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const signature = request.headers.get("upstash-signature");
	if (!signature) {
		return Response.json({ error: "Missing signature" }, { status: 401 });
	}
	const valid = await receiver.verify({
		body,
		signature,
		url: `${env.NEXT_PUBLIC_API_URL}/api/factory/dispatch-stage`,
	});
	if (!valid) {
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	const parsed = payloadSchema.safeParse(JSON.parse(body));
	if (!parsed.success) {
		console.error("[factory/dispatch-stage] invalid payload", parsed.error);
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	const [item] = await dbWs
		.select()
		.from(factoryItems)
		.where(eq(factoryItems.id, parsed.data.itemId))
		.limit(1);
	if (!item) return Response.json({ ok: true, skipped: "item deleted" });

	const [factory] = await dbWs
		.select()
		.from(factories)
		.where(eq(factories.id, item.factoryId))
		.limit(1);
	if (!factory?.enabled) {
		return Response.json({ ok: true, skipped: "factory disabled" });
	}
	// A stale revision means something else already moved the item — the CAS
	// inside dispatchFactoryStage would reject anyway; skip the workspace cost.
	if (item.revision !== parsed.data.expectedRevision) {
		return Response.json({ ok: true, skipped: "revision changed" });
	}

	const outcome = await dispatchFactoryStage({
		factory,
		item,
		stage: parsed.data.stage,
		expectedRevision: parsed.data.expectedRevision,
		relayUrl: await getRelayUrl(factory.ownerUserId),
	});
	// Non-dispatched outcomes are recorded on the ledger; 200 keeps QStash
	// from retrying what the factory already knows about.
	return Response.json({ ok: true, outcome: outcome.status });
}
