import { describe, expect, test } from "bun:test";
import type { TerminalPreset } from "@superset/local-db";
import { clearImportedCliTerminalScripts } from "./cli-terminal-script-import";

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

describe("clearImportedCliTerminalScripts", () => {
	test("keeps the row for v1 but drops the import markers", () => {
		const regular = pendingScript({
			id: "regular",
			cliImportPending: undefined,
			cliTargetOrganizationId: undefined,
		});
		const result = clearImportedCliTerminalScripts({
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

	test("preserves pending scripts for another organization", () => {
		const script = pendingScript();
		const result = clearImportedCliTerminalScripts({
			scripts: [script],
			organizationId: "org-b",
			ids: [script.id],
		});

		expect(result).toEqual({ scripts: [script], changed: false });
	});

	test("ignores ids that are not pending", () => {
		const script = pendingScript({ cliImportPending: undefined });
		const result = clearImportedCliTerminalScripts({
			scripts: [script],
			organizationId: "org-a",
			ids: [script.id],
		});

		expect(result).toEqual({ scripts: [script], changed: false });
	});
});
