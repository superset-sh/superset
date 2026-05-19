import { Client } from "@upstash/qstash";

import { env } from "@/env";

export const qstash = env.QSTASH_TOKEN
	? new Client({
			token: env.QSTASH_TOKEN,
			...(env.QSTASH_URL ? { baseUrl: env.QSTASH_URL } : {}),
		})
	: null;

export function requireQstash(context: string) {
	if (!qstash) {
		throw new Error(
			`[${context}] QSTASH_TOKEN is required to enqueue background jobs`,
		);
	}

	return qstash;
}

interface EnqueueJobInput {
	url: string;
	body: unknown;
	retries?: number;
}

export async function enqueueOrRunLocalJob(
	context: string,
	{ url, body, retries = 3 }: EnqueueJobInput,
) {
	if (env.NODE_ENV === "development" && !qstash) {
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			throw new Error(
				`[${context}] local job request failed: ${response.status}`,
			);
		}

		return;
	}

	await requireQstash(context).publishJSON({
		url,
		body,
		retries,
	});
}
