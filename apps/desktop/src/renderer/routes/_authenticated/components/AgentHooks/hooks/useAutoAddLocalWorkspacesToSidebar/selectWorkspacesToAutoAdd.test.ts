import { describe, expect, it } from "bun:test";
import {
	type AutoAddWorkspaceCandidate,
	selectWorkspacesToAutoAdd,
} from "./selectWorkspacesToAutoAdd";

const projectId = "project-1";

function workspace(id: string): AutoAddWorkspaceCandidate {
	return { id, projectId };
}

describe("selectWorkspacesToAutoAdd", () => {
	// Reproduces #5329: a CLI-created workspace exists on this device but the
	// host/CLI create path can't write the renderer-local v2WorkspaceLocalState
	// row, so the workspace has no local-state row and stays invisible in the
	// sidebar. It must be selected for backfill.
	it("selects a CLI-created workspace that has no local-state row", () => {
		const cliWorkspace = workspace("cli-ws");

		const toAdd = selectWorkspacesToAutoAdd([cliWorkspace], []);

		expect(toAdd).toEqual([cliWorkspace]);
	});

	it("leaves GUI-created workspaces alone (they already have a row)", () => {
		const guiWorkspace = workspace("gui-ws");

		const toAdd = selectWorkspacesToAutoAdd([guiWorkspace], [guiWorkspace.id]);

		expect(toAdd).toEqual([]);
	});

	// A removed/unpinned workspace keeps its local-state row as an isHidden
	// tombstone, so its id is "known". The hook must not re-pin it.
	it("does not re-add a dismissed (tombstoned) workspace", () => {
		const dismissed = workspace("dismissed-ws");

		const toAdd = selectWorkspacesToAutoAdd([dismissed], [dismissed.id]);

		expect(toAdd).toEqual([]);
	});

	it("backfills only the unknown workspaces from a mixed set", () => {
		const cliWorkspace = workspace("cli-ws");
		const guiWorkspace = workspace("gui-ws");
		const dismissed = workspace("dismissed-ws");

		const toAdd = selectWorkspacesToAutoAdd(
			[cliWorkspace, guiWorkspace, dismissed],
			[guiWorkspace.id, dismissed.id],
		);

		expect(toAdd).toEqual([cliWorkspace]);
	});

	it("returns nothing when there are no local workspaces", () => {
		expect(selectWorkspacesToAutoAdd([], ["gui-ws"])).toEqual([]);
	});
});
