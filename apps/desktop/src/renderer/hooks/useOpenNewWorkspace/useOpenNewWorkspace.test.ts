import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const navigate = mock(() => Promise.resolve());
mock.module(
	"renderer/routes/_authenticated/providers/LocalHostServiceProvider",
	() => ({
		useLocalHostService: () => ({ machineId: "this-machine" }),
	}),
);

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
const {
	act,
	cleanup,
	renderHook: renderHookWithOptions,
} = await import("@testing-library/react");
const {
	createRootRoute,
	createRouter,
	createMemoryHistory,
	RouterContextProvider,
} = await import("@tanstack/react-router");
const { createElement } = await import("react");
function renderHook<Result>(hook: () => Result) {
	const router = createRouter({
		routeTree: createRootRoute(),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	router.navigate = navigate;
	return renderHookWithOptions(hook, {
		wrapper: ({ children }) =>
			createElement(RouterContextProvider, { router, children }),
	});
}
const { useNewWorkspaceDraftStore } = await import(
	"renderer/stores/new-workspace-draft"
);
const { useOpenNewWorkspace, useOpenNewWorkspaceForLocalProject } =
	await import("./useOpenNewWorkspace");

beforeEach(() => {
	navigate.mockClear();
	useNewWorkspaceDraftStore.getState().resetDraft();
});
afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

test.each([
	"cloud",
	"other-machine",
])("local project handoff overrides %s while preserving the draft", (hostId) => {
	useNewWorkspaceDraftStore.getState().updateDraft({
		hostId,
		selectedProjectId: "old-project",
		prompt: "Keep my prompt",
		checkout: "local",
	});
	const { result } = renderHook(useOpenNewWorkspaceForLocalProject);
	act(() => result.current("new-project"));
	expect(navigate).toHaveBeenCalledWith(
		expect.objectContaining({
			to: "/new-workspace",
			search: { projectId: "new-project", host: "this-machine" },
		}),
	);
	expect(useNewWorkspaceDraftStore.getState()).toMatchObject({
		hostId: "this-machine",
		selectedProjectId: "new-project",
		isSession: false,
		prompt: "Keep my prompt",
		checkout: "local",
	});
	useNewWorkspaceDraftStore.getState().updateDraft({ hostId: "cloud" });
	act(() => result.current("second-project"));
	expect(useNewWorkspaceDraftStore.getState().hostId).toBe("this-machine");
});

test("ordinary new workspace navigation preserves the selected remote host", () => {
	useNewWorkspaceDraftStore.getState().updateDraft({ hostId: "other-machine" });
	const { result } = renderHook(useOpenNewWorkspace);
	act(() => result.current("existing-project"));
	expect(useNewWorkspaceDraftStore.getState().hostId).toBe("other-machine");
});
