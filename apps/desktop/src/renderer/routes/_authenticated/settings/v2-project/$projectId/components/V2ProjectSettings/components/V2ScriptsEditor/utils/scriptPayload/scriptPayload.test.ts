import { describe, expect, it } from "bun:test";
import {
	buildPayload,
	parseConfigContent,
	type ScriptPayload,
	type ScriptTexts,
	toScriptTexts,
	trimScriptValue,
} from "./scriptPayload";

const EMPTY: ScriptPayload = { setup: [], teardown: [], run: [] };

function editedTexts(overrides: Partial<ScriptTexts>): ScriptTexts {
	return { setup: "", teardown: "", run: "", ...overrides };
}

const COMMENTED_SCRIPT = [
	"#!/bin/bash",
	"# Deletes DerivedData for this worktree.",
	"set -euo pipefail",
	'rm -rf "$DERIVED_DATA/$WORKTREE"',
].join("\n");

const CONTROL_FLOW_SCRIPT = [
	'for dir in "$DERIVED_DATA"/*/; do',
	'  if [ -d "$dir" ]; then',
	'    rm -rf "$dir"',
	"  fi",
	"done",
].join("\n");

describe("parseConfigContent", () => {
	it("returns empty arrays for missing or invalid content", () => {
		expect(parseConfigContent(null)).toEqual(EMPTY);
		expect(parseConfigContent("not json")).toEqual(EMPTY);
	});

	it("keeps a multi-line entry as one entry and drops non-strings", () => {
		const content = JSON.stringify({
			setup: ["bun install", 42],
			teardown: ["#!/bin/bash\n# cleanup\ntouch /tmp/x"],
		});
		expect(parseConfigContent(content)).toEqual({
			setup: ["bun install"],
			teardown: ["#!/bin/bash\n# cleanup\ntouch /tmp/x"],
			run: [],
		});
	});
});

describe("buildPayload", () => {
	it.each([
		"setup",
		"teardown",
		"run",
	] as const)("saves an edited multi-line %s script with comments as a single entry", (field) => {
		const payload = buildPayload(
			editedTexts({ [field]: COMMENTED_SCRIPT }),
			EMPTY,
		);
		expect(payload[field]).toEqual([COMMENTED_SCRIPT]);
	});

	it("preserves indentation inside shell control flow", () => {
		const payload = buildPayload(
			editedTexts({ teardown: CONTROL_FLOW_SCRIPT }),
			EMPTY,
		);
		expect(payload.teardown).toEqual([CONTROL_FLOW_SCRIPT]);
	});

	it("saves a one-line command as a single entry", () => {
		const payload = buildPayload(editedTexts({ run: "bun dev" }), EMPTY);
		expect(payload.run).toEqual(["bun dev"]);
	});

	it("saves a blank field as no entries so the .sh fallback still applies", () => {
		const payload = buildPayload(editedTexts({ teardown: "  \n\t\n" }), EMPTY);
		expect(payload.teardown).toEqual([]);
	});

	it("round-trips a loaded multi-line script unchanged", () => {
		const loaded: ScriptPayload = {
			setup: ["bun install"],
			teardown: [COMMENTED_SCRIPT],
			run: [CONTROL_FLOW_SCRIPT],
		};
		expect(buildPayload(toScriptTexts(loaded), loaded)).toEqual(loaded);
	});

	it("keeps legacy per-line entries of fields the user did not edit", () => {
		const loaded: ScriptPayload = {
			setup: ["bun install", "bun run db:migrate"],
			teardown: ["docker compose down"],
			run: [],
		};
		const texts = { ...toScriptTexts(loaded), run: "bun dev" };
		expect(buildPayload(texts, loaded)).toEqual({
			setup: ["bun install", "bun run db:migrate"],
			teardown: ["docker compose down"],
			run: ["bun dev"],
		});
	});
});

describe("trimScriptValue", () => {
	it("strips surrounding blank lines but keeps indentation", () => {
		expect(trimScriptValue("\n\n  if true; then\n    echo hi\n  fi\n\n")).toBe(
			"  if true; then\n    echo hi\n  fi",
		);
	});

	it("leaves a script without surrounding whitespace untouched", () => {
		expect(trimScriptValue(CONTROL_FLOW_SCRIPT)).toBe(CONTROL_FLOW_SCRIPT);
	});
});
