import * as Sentry from "@sentry/nextjs";
import {
	syncAllOrganizationPluginSources,
	syncOrganizationPluginSource,
} from "@superset/trpc/lib/organization-plugins";
import { z } from "zod";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({ sourceId: z.string().uuid().optional() });

/**
 * One source when an admin asks for a sync; every source when the daily
 * QStash schedule calls with no body. That schedule lives in the Upstash
 * console, not in this repo.
 */
export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/organization-plugins/jobs/sync",
	);
	if (rejected) return rejected;

	let json: unknown = {};
	try {
		json = body ? JSON.parse(body) : {};
	} catch {
		json = null;
	}
	const parsed = bodySchema.safeParse(json);
	if (!parsed.success) {
		return Response.json({ error: "Invalid body" }, { status: 400 });
	}

	if (parsed.data.sourceId) {
		const outcome = await syncOrganizationPluginSource(parsed.data.sourceId);
		return Response.json({ ok: !outcome.error, ...outcome });
	}
	const outcome = await Sentry.withMonitor(
		"organization-plugin-sync",
		syncAllOrganizationPluginSources,
		{ schedule: { type: "crontab", value: "0 6 * * *" } },
	);
	return Response.json({ ok: true, ...outcome });
}
