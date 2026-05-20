import { Client } from "@upstash/qstash";

import { env } from "../env";

export const qstash = env.QSTASH_TOKEN
	? new Client({ token: env.QSTASH_TOKEN })
	: null;

export function requireQstash(context: string) {
	if (!qstash) {
		throw new Error(
			`[${context}] QSTASH_TOKEN is required to enqueue background jobs`,
		);
	}

	return qstash;
}
