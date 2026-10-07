import {
	isSelfHostQueue,
	isSelfHostQueueRequest,
} from "@superset/shared/self-host-queue";
import { Receiver } from "@upstash/qstash";
import { env } from "@/env";

const receiver = isSelfHostQueue()
	? null
	: new Receiver({
			currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY ?? "",
			nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY ?? "",
		});

/**
 * Cloud development invokes jobs directly because QStash cannot reach
 * localhost. Native jobs authenticate the worker before that bypass.
 */
export async function verifyQstashRequest(
	request: Request,
	body: string,
	path: string,
): Promise<Response | null> {
	if (isSelfHostQueue())
		return isSelfHostQueueRequest(request.headers)
			? null
			: Response.json(
					{ error: "Invalid self-host queue authentication" },
					{ status: 401 },
				);
	if (env.NODE_ENV === "development") return null;
	const signature = request.headers.get("upstash-signature");
	if (!signature) {
		return Response.json({ error: "Missing signature" }, { status: 401 });
	}
	try {
		const valid = await receiver?.verify({
			body,
			signature,
			url: `${env.NEXT_PUBLIC_API_URL}${path}`,
		});
		if (!valid) {
			return Response.json({ error: "Invalid signature" }, { status: 401 });
		}
	} catch (error) {
		console.error(`[qstash${path}] signature verification failed:`, error);
		return Response.json(
			{ error: "Signature verification failed" },
			{ status: 401 },
		);
	}
	return null;
}
