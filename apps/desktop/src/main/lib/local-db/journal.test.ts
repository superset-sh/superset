import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const JOURNAL = join(
	import.meta.dir,
	"../../../../../../packages/local-db/drizzle/meta/_journal.json",
);

describe("local.db migrations", () => {
	test("every shipped journal entry has a distinct `when`", () => {
		// runMigrations identifies applied migrations by `when`. Two entries
		// sharing one would let a real migration be mistaken for an applied one.
		const journal = JSON.parse(readFileSync(JOURNAL, "utf8")) as {
			entries: { when: number }[];
		};
		const whens = journal.entries.map((entry) => entry.when);

		expect(new Set(whens).size).toBe(whens.length);
	});
});
