import { env } from "@/env";
import { verifyQstashRequest } from "./verifyQstash";

/**
 * Authenticates a periodic tick. Vercel Cron invokes these routes with
 * `Authorization: Bearer CRON_SECRET`; the QStash signature is still accepted
 * so a schedule created in the console keeps working during the cutover.
 */
export async function verifyCronRequest(
	request: Request,
	body: string,
	path: string,
): Promise<Response | null> {
	const secret = env.CRON_SECRET;
	const authorization = request.headers.get("authorization");
	if (secret && authorization === `Bearer ${secret}`) return null;
	return verifyQstashRequest(request, body, path);
}
