import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useProjectPreselection } = await import("./useProjectPreselection");
const { useNewWorkspaceDraftStore } = await import(
	"renderer/stores/new-workspace-draft"
);
afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

test("holds the intended project while its list refreshes, then permits manual selection", () => {
	useNewWorkspaceDraftStore.getState().resetDraft();
	useNewWorkspaceDraftStore.getState().selectProject("new-project");
	const { result, rerender } = renderHook(
		({ projects, requested }) => {
			const draft = useNewWorkspaceDraftStore();
			const pending = useProjectPreselection({
				isOpen: true,
				areProjectsReady: true,
				projects,
				preSelectedProjectId: requested,
				preSelectedSession: false,
				selectedProjectId: draft.selectedProjectId,
				isSession: draft.isSession,
				lastProjectId: "old-project",
				selectProject: draft.selectProject,
				selectSession: draft.selectSession,
				updateDraft: draft.updateDraft,
			});
			return { pending, selectedProjectId: draft.selectedProjectId };
		},
		{
			initialProps: {
				projects: [{ id: "old-project" }],
				requested: "new-project",
			},
		},
	);
	expect(result.current).toEqual({
		pending: true,
		selectedProjectId: "new-project",
	});
	rerender({ projects: [{ id: "old-project" }], requested: "new-project" });
	expect(result.current).toEqual({
		pending: true,
		selectedProjectId: "new-project",
	});
	rerender({
		projects: [{ id: "old-project" }, { id: "new-project" }],
		requested: "new-project",
	});
	expect(result.current).toEqual({
		pending: false,
		selectedProjectId: "new-project",
	});
	act(() => useNewWorkspaceDraftStore.getState().selectProject("old-project"));
	expect(result.current).toEqual({
		pending: false,
		selectedProjectId: "old-project",
	});
	rerender({
		projects: [{ id: "old-project" }, { id: "new-project" }],
		requested: "third-project",
	});
	expect(result.current.pending).toBe(true);
});

test("direct URL preselection blocks a remembered project until the requested project arrives", () => {
	const selectProject = mock();
	const updateDraft = mock();
	const { result, rerender } = renderHook(
		({ projects }) =>
			useProjectPreselection({
				isOpen: true,
				areProjectsReady: true,
				projects,
				preSelectedProjectId: "new-project",
				preSelectedSession: false,
				selectedProjectId: "old-project",
				isSession: false,
				lastProjectId: "old-project",
				selectProject,
				selectSession: mock(),
				updateDraft,
			}),
		{ initialProps: { projects: [{ id: "old-project" }] } },
	);
	expect(result.current).toBe(true);
	expect(selectProject).not.toHaveBeenCalled();
	expect(updateDraft).not.toHaveBeenCalled();
	rerender({ projects: [{ id: "old-project" }, { id: "new-project" }] });
	expect(selectProject).toHaveBeenCalledWith("new-project");
	expect(result.current).toBe(false);
});
