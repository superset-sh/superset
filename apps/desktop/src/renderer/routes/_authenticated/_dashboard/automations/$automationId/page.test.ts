import { describe, expect, test } from "bun:test";

function readRouteSource() {
	return Bun.file(`${import.meta.dir}/page.tsx`).text();
}

describe("automation detail route source", () => {
	test("does not enter prompt edit mode just because no run is selected", async () => {
		const source = await readRouteSource();

		expect(source).toContain("const isEditingPrompt = editPrompt === true;");
		expect(source).not.toContain("editPrompt === true || !selectedRunId");
		expect(source).toContain("<AutomationNoRunsPanel");
	});

	test("does not reset prompt edits on every automation object render", async () => {
		const source = await readRouteSource();

		expect(source).not.toContain("[automation?.id, automation]");
		expect(source).not.toContain(
			"[automation?.id, automation?.prompt, isEditingPrompt, automation]",
		);
	});
});
