import { describe, expect, test } from "bun:test";
import type { TerminalPreset } from "@superset/local-db";
import {
	acknowledgeCliTerminalScripts,
	isPendingCliTerminalScript,
} from "./cli-terminal-script-import";

const pendingScript = (
	overrides: Partial<TerminalPreset> = {},
): TerminalPreset => ({
	id: "script-a",
	name: "Script A",
	cwd: "",
	commands: ["echo a"],
	cliImportPending: true,
	cliTargetOrganizationId: "org-a",
	...overrides,
});

describe("isPendingCliTerminalScript", () => {
	test("matches import markers and delete tombstones for the organization", () => {
		expect(isPendingCliTerminalScript(pendingScript(), "org-a")).toBe(true);
		expect(
			isPendingCliTerminalScript(
				pendingScript({ cliImportPending: undefined, cliDeletePending: true }),
				"org-a",
			),
		).toBe(true);
		expect(isPendingCliTerminalScript(pendingScript(), "org-b")).toBe(false);
		expect(
			isPendingCliTerminalScript(
				pendingScript({ cliImportPending: undefined }),
				"org-a",
			),
		).toBe(false);
	});
});

describe("acknowledgeCliTerminalScripts", () => {
	test("keeps the row for v1 but drops the import markers", () => {
		const regular = pendingScript({
			id: "regular",
			cliImportPending: undefined,
			cliTargetOrganizationId: undefined,
		});
		const result = acknowledgeCliTerminalScripts({
			scripts: [pendingScript(), regular],
			organizationId: "org-a",
			ids: ["script-a"],
		});

		expect(result.changed).toBe(true);
		expect(result.scripts).toEqual([
			{ id: "script-a", name: "Script A", cwd: "", commands: ["echo a"] },
			regular,
		]);
	});

	test("drops delete tombstones entirely", () => {
		const tombstone = pendingScript({
			id: "gone",
			cliImportPending: undefined,
			cliDeletePending: true,
		});
		const result = acknowledgeCliTerminalScripts({
			scripts: [pendingScript(), tombstone],
			organizationId: "org-a",
			ids: ["gone"],
		});

		expect(result.changed).toBe(true);
		expect(result.scripts).toEqual([pendingScript()]);
	});

	test("preserves pending scripts for another organization", () => {
		const script = pendingScript();
		const result = acknowledgeCliTerminalScripts({
			scripts: [script],
			organizationId: "org-b",
			ids: [script.id],
		});

		expect(result).toEqual({ scripts: [script], changed: false });
	});

	test("ignores ids that are not pending", () => {
		const script = pendingScript({ cliImportPending: undefined });
		const result = acknowledgeCliTerminalScripts({
			scripts: [script],
			organizationId: "org-a",
			ids: [script.id],
		});

		expect(result).toEqual({ scripts: [script], changed: false });
	});
});
