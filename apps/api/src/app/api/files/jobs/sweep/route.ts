import {
	FILE_SWEEP_JOB_PATH,
	sweepPendingFiles,
} from "@superset/trpc/file-sweep";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Daily: a `pending` row is an upload whose `complete` never came — the
 * client died mid-PUT, or verification failed after the object landed.
 * After a day it is never completing; drop the row and the object.
 */
export async function POST(request: Request) {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		FILE_SWEEP_JOB_PATH,
	);
	if (rejected) return rejected;

	const result = await sweepPendingFiles();
	return Response.json(result);
}
