import { describe, expect, test } from "bun:test";
import journal from "../drizzle/meta/_journal.json";

const expected = journal.entries.at(-1);
if (!expected) throw new Error("The actual migration journal has no entries");

type Event = {
	kind: string;
	operation: string;
	url?: string;
	sql?: string;
};

function run(scenario: string, backend?: "0" | "1") {
	const result = Bun.spawnSync({
		cmd: [
			process.execPath,
			"--no-env-file",
			new URL("./verify-migrations-applied.fixture.ts", import.meta.url)
				.pathname,
		],
		env: {
			PATH: process.env.PATH,
			DATABASE_URL: "postgres://fixture@pooled.invalid/pooled_database",
			DATABASE_URL_UNPOOLED:
				"postgres://fixture@unpooled.invalid/unpooled_database",
			VERIFY_FIXTURE_SCENARIO: scenario,
			...(backend === undefined ? {} : { SELF_HOST_DB: backend }),
		},
		stdout: "pipe",
		stderr: "pipe",
		timeout: 5000,
	});
	const stdout = result.stdout.toString();
	const stderr = result.stderr.toString();
	const events: Event[] = stdout
		.split("\n")
		.filter((line) => line.startsWith("VERIFY_FIXTURE_EVENT "))
		.map((line) => JSON.parse(line.slice("VERIFY_FIXTURE_EVENT ".length)));
	return { ...result, stdout, stderr, events };
}

describe("Actual migration verifier entrypoint", () => {
	for (const backend of [undefined, "0", "1"] as const) {
		const kind = backend === "1" ? "postgres" : "neon";
		for (const scenario of [
			"current",
			"missing",
			"null",
			"older",
			"newer",
			"query-error",
		]) {
			test(`${kind} (${backend ?? "default"}): ${scenario}`, () => {
				const result = run(scenario, backend);
				expect(result.events[0]).toEqual({
					kind,
					operation: "open",
					url: "postgres://fixture@unpooled.invalid/unpooled_database",
				});
				expect(result.events[1]?.kind).toBe(kind);
				expect(result.events[1]?.operation).toBe("query");
				expect(result.events[1]?.sql?.replace(/\s+/g, " ").trim()).toBe(
					"select max(created_at)::text as latest from drizzle.__drizzle_migrations",
				);
				expect(result.events.map((entry) => entry.operation)).toEqual(
					backend === "1" ? ["open", "query", "end"] : ["open", "query"],
				);
				if (scenario === "current") {
					expect(result.exitCode).toBe(0);
					expect(result.stderr).toBe("");
					expect(result.stdout).toContain(`Database is at ${expected.tag}`);
				} else {
					expect(result.exitCode).toBe(1);
					expect(result.stdout).not.toContain("Database is at ");
					if (scenario === "query-error") {
						expect(result.stderr).toBe("Controlled query failure\n");
					} else {
						expect(result.stderr).toContain(
							`Database is not at ${expected.tag}: newest applied migration is `,
						);
						expect(result.stderr).toContain(`expected ${expected.when}`);
					}
				}
			});
		}
	}

	test("native cleanup failure causes the actual script to fail", () => {
		const result = run("end-error", "1");
		expect(result.events.map((entry) => entry.operation)).toEqual([
			"open",
			"query",
			"end",
		]);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toBe("Controlled cleanup failure\n");
	});
});
