import { z } from "zod";

import { verifyQstashRequest } from "@/lib/verifyQstash";
import { purgeExpiredDeletions } from "./purgeExpiredDeletions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PATH = "/api/account/jobs/purge-expired-deletions";

/**
 * Purging is irreversible, so a run only reports unless its signed body is
 * exactly `{"dryRun": false}`. An empty body or a schedule set up without
 * one stays a dry run.
 */
const bodySchema = z.object({ dryRun: z.boolean().default(true) });

export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(request, body, PATH);
	if (rejected) return rejected;

	let json: unknown = {};
	if (body) {
		try {
			json = JSON.parse(body);
		} catch {
			return Response.json({ error: "Invalid JSON" }, { status: 400 });
		}
	}
	const parsed = bodySchema.safeParse(json);
	if (!parsed.success) {
		return Response.json({ error: "Invalid payload" }, { status: 400 });
	}

	return Response.json(
		await purgeExpiredDeletions({
			now: Date.now,
			dryRun: parsed.data.dryRun,
		}),
	);
}
