import { Client } from "@upstash/qstash";
import { env } from "../../env";

const qstash = new Client({ token: env.QSTASH_TOKEN });

/**
 * QStash only calls public URLs, so a local API would queue a job nothing ever
 * delivers. Run it in-process there instead — still detached, so the caller
 * returns as fast as it does in production and the UI behaves the same.
 */
const isLocalApi = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(
	env.NEXT_PUBLIC_API_URL,
);

/**
 * Queued rather than fired off after the response: this runs on Vercel, where
 * the function is frozen the moment it replies, and an unawaited promise dies
 * with it. QStash also retries a delivery the function never finished.
 */
export async function publishCloudWorkspaceJob<Body>(args: {
	path: string;
	body: Body;
	delaySeconds?: number;
	runLocally: (body: Body) => Promise<unknown>;
}): Promise<void> {
	if (isLocalApi) {
		setTimeout(
			() => {
				args.runLocally(args.body).catch((error) => {
					console.error(`[cloud-workspace] job ${args.path} threw`, error);
				});
			},
			(args.delaySeconds ?? 0) * 1000,
		);
		return;
	}
	await qstash.publishJSON({
		url: `${env.NEXT_PUBLIC_API_URL}${args.path}`,
		body: args.body,
		retries: 2,
		...(args.delaySeconds ? { delay: args.delaySeconds } : {}),
	});
}
