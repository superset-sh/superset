import { reconcileCloudWorkspaceUsage } from "@superset/trpc/cloud-workspace-meter";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Run by a QStash schedule every 10 minutes. That schedule lives in the
 * Upstash console, not in this repo.
 */
export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/cloud-workspaces/jobs/reconcile-usage",
	);
	if (rejected) return rejected;

	const outcome = await reconcileCloudWorkspaceUsage();
	return Response.json({ ok: true, ...outcome });
}
