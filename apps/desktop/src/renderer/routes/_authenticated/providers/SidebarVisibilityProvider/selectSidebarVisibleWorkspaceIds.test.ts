import { describe, expect, it } from "bun:test";
import { selectSidebarVisibleWorkspaceIds } from "./selectSidebarVisibleWorkspaceIds";

const MACHINE_ID = "machine-local";
const PINNED = new Set(["project-pinned"]);

describe("selectSidebarVisibleWorkspaceIds", () => {
	it("includes a non-hidden workspace under a pinned project", () => {
		const visible = selectSidebarVisibleWorkspaceIds({
			localStateWorkspaces: [
				{ id: "ws-1", projectId: "project-pinned", isHidden: false },
			],
			mainWorkspaces: [],
			sidebarProjectIds: PINNED,
			machineId: MACHINE_ID,
		});
		expect(visible).toEqual(new Set(["ws-1"]));
	});

	it("excludes a workspace whose project is not pinned (matches the tree)", () => {
		const visible = selectSidebarVisibleWorkspaceIds({
			localStateWorkspaces: [
				{ id: "ws-1", projectId: "project-pinned", isHidden: false },
				{ id: "ws-2", projectId: "project-unpinned", isHidden: false },
			],
			mainWorkspaces: [],
			sidebarProjectIds: PINNED,
			machineId: MACHINE_ID,
		});
		expect(visible).toEqual(new Set(["ws-1"]));
	});

	it("excludes a hidden workspace even when its project is pinned", () => {
		const visible = selectSidebarVisibleWorkspaceIds({
			localStateWorkspaces: [
				{ id: "ws-1", projectId: "project-pinned", isHidden: true },
			],
			mainWorkspaces: [],
			sidebarProjectIds: PINNED,
			machineId: MACHINE_ID,
		});
		expect(visible).toEqual(new Set());
	});

	it("auto-includes a local main workspace under a pinned project with no local-state row", () => {
		const visible = selectSidebarVisibleWorkspaceIds({
			localStateWorkspaces: [],
			mainWorkspaces: [
				{ id: "main-1", projectId: "project-pinned", hostId: MACHINE_ID },
			],
			sidebarProjectIds: PINNED,
			machineId: MACHINE_ID,
		});
		expect(visible).toEqual(new Set(["main-1"]));
	});

	it("does not auto-include a main workspace on a different machine", () => {
		const visible = selectSidebarVisibleWorkspaceIds({
			localStateWorkspaces: [],
			mainWorkspaces: [
				{ id: "main-remote", projectId: "project-pinned", hostId: "other" },
			],
			sidebarProjectIds: PINNED,
			machineId: MACHINE_ID,
		});
		expect(visible).toEqual(new Set());
	});

	it("does not auto-include a main workspace whose project is not pinned", () => {
		const visible = selectSidebarVisibleWorkspaceIds({
			localStateWorkspaces: [],
			mainWorkspaces: [
				{ id: "main-1", projectId: "project-unpinned", hostId: MACHINE_ID },
			],
			sidebarProjectIds: PINNED,
			machineId: MACHINE_ID,
		});
		expect(visible).toEqual(new Set());
	});

	it("does not auto-include a main workspace that already has a local-state row", () => {
		// A row means the user placed or dismissed it; the local-state pass owns
		// that decision, so the auto-include pass must not resurrect a hidden one.
		const visible = selectSidebarVisibleWorkspaceIds({
			localStateWorkspaces: [
				{ id: "main-1", projectId: "project-pinned", isHidden: true },
			],
			mainWorkspaces: [
				{ id: "main-1", projectId: "project-pinned", hostId: MACHINE_ID },
			],
			sidebarProjectIds: PINNED,
			machineId: MACHINE_ID,
		});
		expect(visible).toEqual(new Set());
	});
});
