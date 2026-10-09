import { Client } from "@upstash/qstash";
import { env } from "@/env";

const qstash = new Client({ token: env.QSTASH_TOKEN, baseUrl: env.QSTASH_URL });

/**
 * The watch is set up out of band: a failure there (an unreachable topic,
 * say) must not turn a successful authorization into an error page.
 */
export async function enqueueWatchSetup(connectionId: string): Promise<void> {
	const jobUrl = `${env.NEXT_PUBLIC_API_URL}/api/integrations/google/jobs/renew-watches`;
	const body = { connectionId };
	if (env.NODE_ENV === "development") {
		fetch(jobUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}).catch((error) => {
			console.error("[google] dev watch setup failed:", error);
		});
		return;
	}
	try {
		await qstash.publishJSON({ url: jobUrl, body, retries: 3 });
	} catch (error) {
		console.error("[google] failed to queue watch setup:", error);
	}
}
