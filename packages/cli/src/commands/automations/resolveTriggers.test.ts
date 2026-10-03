import { describe, expect, it } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLIError } from "@superset/cli-framework";
import { resolveTriggers } from "./resolveTriggers";

const TRIGGER = {
	config: {
		kind: "slack",
		event: "reaction_added",
		channels: { mode: "any" },
		emoji: { mode: "any" },
		actor: { mode: "any" },
	},
};

function fileWith(contents: string): string {
	const path = join(mkdtempSync(join(tmpdir(), "triggers-")), "triggers.json");
	writeFileSync(path, contents);
	return path;
}

describe("resolveTriggers", () => {
	it("returns undefined when neither source is given", () => {
		expect(resolveTriggers({})).toBeUndefined();
	});

	it("parses an inline trigger set", () => {
		const result = resolveTriggers({ triggers: JSON.stringify([TRIGGER]) });
		expect(result).toHaveLength(1);
	});

	it("parses a trigger set from a file", () => {
		const result = resolveTriggers({
			triggersFile: fileWith(JSON.stringify([TRIGGER])),
		});
		expect(result).toHaveLength(1);
	});

	// A trigger write replaces the whole set, so silently preferring one source
	// would delete whatever the ignored one held.
	it("refuses both sources at once", () => {
		expect(() =>
			resolveTriggers({
				triggers: JSON.stringify([TRIGGER]),
				triggersFile: fileWith(JSON.stringify([])),
			}),
		).toThrow(CLIError);
	});

	it("reports an unreadable file as a CLI error naming the path", () => {
		const missing = join(tmpdir(), "definitely-absent-triggers.json");
		expect(() => resolveTriggers({ triggersFile: missing })).toThrow(CLIError);
		expect(() => resolveTriggers({ triggersFile: missing })).toThrow(missing);
	});

	it("rejects a non-array trigger set", () => {
		expect(() => resolveTriggers({ triggers: "{}" })).toThrow(CLIError);
	});
});
