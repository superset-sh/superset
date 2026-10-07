import { mock } from "bun:test";
import journal from "../drizzle/meta/_journal.json";

const expected = journal.entries.at(-1);
if (!expected) throw new Error("The actual migration journal has no entries");

const event = (value: Record<string, unknown>) =>
	console.log(`VERIFY_FIXTURE_EVENT ${JSON.stringify(value)}`);

const transport = (kind: "neon" | "postgres", url: string) => {
	event({ kind, operation: "open", url });
	const sql = async (strings: TemplateStringsArray) => {
		event({ kind, operation: "query", sql: strings.join("?") });
		const scenario = process.env.VERIFY_FIXTURE_SCENARIO;
		if (scenario === "query-error") throw new Error("Controlled query failure");
		if (scenario === "missing") return [];
		const latest =
			scenario === "null"
				? null
				: scenario === "older"
					? String(expected.when - 1)
					: scenario === "newer"
						? String(expected.when + 1)
						: String(expected.when);
		return [{ latest }];
	};
	return Object.assign(sql, {
		end: async () => {
			event({ kind, operation: "end" });
			if (process.env.VERIFY_FIXTURE_SCENARIO === "end-error")
				throw new Error("Controlled cleanup failure");
		},
	});
};

mock.module("dotenv", () => ({ config: () => ({ parsed: {} }) }));
mock.module("@neondatabase/serverless", () => ({
	neon: (url: string) => transport("neon", url),
}));
mock.module("postgres", () => ({
	default: (url: string) => transport("postgres", url),
}));
mock.module("./client", () => ({
	db: {
		execute: async () => {
			throw new Error("The verifier must not use the pooled ORM client");
		},
	},
}));

await import("./verify-migrations-applied");
