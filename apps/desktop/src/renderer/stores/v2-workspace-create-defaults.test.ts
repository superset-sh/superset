import { beforeEach, describe, expect, it } from "bun:test";
import { useV2WorkspaceCreateDefaultsStore } from "./v2-workspace-create-defaults";

describe("useV2WorkspaceCreateDefaultsStore host defaults", () => {
	beforeEach(() => {
		useV2WorkspaceCreateDefaultsStore.setState({
			lastHostId: null,
			hostIdsByProjectId: {},
		});
	});

	it("remembers a host per project without disturbing the others", () => {
		const { setHostIdForProject } =
			useV2WorkspaceCreateDefaultsStore.getState();
		setHostIdForProject("project-a", "host-1");
		setHostIdForProject("project-b", "host-2");

		expect(
			useV2WorkspaceCreateDefaultsStore.getState().hostIdsByProjectId,
		).toEqual({ "project-a": "host-1", "project-b": "host-2" });
	});

	it("overwrites the remembered host when a project moves machines", () => {
		const { setHostIdForProject } =
			useV2WorkspaceCreateDefaultsStore.getState();
		setHostIdForProject("project-a", "host-1");
		setHostIdForProject("project-a", "host-2");

		expect(
			useV2WorkspaceCreateDefaultsStore.getState().hostIdsByProjectId[
				"project-a"
			],
		).toBe("host-2");
	});

	it("drops the entry for a null host so the project falls back to the global default", () => {
		const { setHostIdForProject } =
			useV2WorkspaceCreateDefaultsStore.getState();
		setHostIdForProject("project-a", "host-1");
		setHostIdForProject("project-a", null);

		expect(
			useV2WorkspaceCreateDefaultsStore.getState().hostIdsByProjectId,
		).toEqual({});
	});

	it("leaves state untouched when clearing a project that was never remembered", () => {
		const before =
			useV2WorkspaceCreateDefaultsStore.getState().hostIdsByProjectId;
		useV2WorkspaceCreateDefaultsStore
			.getState()
			.setHostIdForProject("project-a", null);

		expect(
			useV2WorkspaceCreateDefaultsStore.getState().hostIdsByProjectId,
		).toBe(before);
	});

	it("keeps lastHostId independent of the per-project map", () => {
		const { setHostIdForProject, setLastHostId } =
			useV2WorkspaceCreateDefaultsStore.getState();
		setLastHostId("host-1");
		setHostIdForProject("project-a", "host-2");

		expect(useV2WorkspaceCreateDefaultsStore.getState().lastHostId).toBe(
			"host-1",
		);
	});
});
