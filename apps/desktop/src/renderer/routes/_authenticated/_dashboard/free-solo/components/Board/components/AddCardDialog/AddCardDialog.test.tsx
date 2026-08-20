import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom over the preloaded plain-object document — the dialog renders
// through cmdk + Radix Dialog, which need a real DOM. Bun runs test files
// sequentially in one process and happy-dom's globals are process-wide, so
// we MUST unregister in afterAll (below) to restore the shared mock document
// for the other renderer suites (same pattern as Redirect.test.tsx).
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render, screen } = await import(
	"@testing-library/react"
);
const React = await import("react");

const workspaces = [
	{
		id: "ws-1",
		hostId: "host-1",
		projectId: "proj-1",
		name: "Alpha",
		hostReachable: true,
		type: "worktree",
	},
	{
		id: "ws-2",
		hostId: "host-1",
		projectId: "proj-2",
		name: "Beta",
		hostReachable: true,
		type: "worktree",
	},
	{
		id: "ws-3",
		hostId: "host-2",
		projectId: "proj-1",
		name: "Gamma",
		hostReachable: false,
		type: "worktree",
	},
];

const scopedPreset = {
	id: "preset-1",
	name: "Deploy Bot",
	cwd: "",
	commands: ["echo hi"],
	projectIds: ["proj-1"],
	executionMode: "new-tab",
	tabOrder: 0,
	createdAt: new Date(0),
};

// External data/host dependencies — stubbed so the wizard renders and steps
// without a real host-service, provider tree, or tanstack-db collection
// (same technique as V2ProjectSettings.test.tsx: mock.module per dependency,
// keep the component's own logic real).
mock.module("@tanstack/react-db", () => ({
	useLiveQuery: () => ({ data: [scopedPreset] }),
}));
mock.module(
	"renderer/routes/_authenticated/providers/HostWorkspacesProvider",
	() => ({
		useHostWorkspaces: () => ({
			workspaces,
			cache: {
				resolveHostUrl: (hostId: string) =>
					hostId === "host-1"
						? "http://host-1"
						: hostId === "host-2"
							? "http://host-2"
							: null,
			},
		}),
	}),
);
mock.module("renderer/hooks/host-projects/useHostProjects", () => ({
	useHostProjects: () => ({ projects: [] }),
}));
mock.module(
	"renderer/routes/_authenticated/providers/LocalHostServiceProvider",
	() => ({
		useLocalHostService: () => ({
			machineId: "host-1",
			activeHostUrl: "http://host-1",
		}),
	}),
);
mock.module(
	"renderer/routes/_authenticated/providers/CollectionsProvider",
	() => ({
		useCollections: () => ({ v2TerminalPresets: {} }),
	}),
);
mock.module("renderer/hooks/useV2AgentConfigs", () => ({
	useV2AgentConfigs: () => ({ data: [] }),
}));
mock.module("renderer/assets/app-icons/preset-icons", () => ({
	getPresetIcon: () => undefined,
	useIsDarkTheme: () => false,
}));
mock.module("renderer/lib/host-service-client", () => ({
	getHostServiceClientByUrl: () => ({
		terminal: {
			createSession: {
				mutate: () => Promise.reject(new Error("not used in this test")),
			},
		},
	}),
}));
mock.module("renderer/stores/v2-notifications", () => ({
	useV2NotificationStore: (
		selector: (state: { terminalSeenAt: Record<string, number> }) => unknown,
	) => selector({ terminalSeenAt: {} }),
}));
mock.module("renderer/stores/workspace-creates", () => ({
	useWorkspaceCreates: () => ({
		submit: () => ({
			completed: Promise.reject(new Error("not used in this test")),
		}),
	}),
}));

const { useFreeSoloBoardStore } = await import(
	"renderer/stores/free-solo-board"
);
const { AddCardDialog } = await import("./AddCardDialog");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});
beforeEach(() => {
	useFreeSoloBoardStore.setState({ cards: [], activeCardId: null });
});

describe("AddCardDialog — start-an-agent wizard", () => {
	test("selecting a preset filters workspaces by project, keeps disabled reasons, and Back returns to the root groups", async () => {
		await act(async () => {
			render(
				React.createElement(AddCardDialog, {
					open: true,
					onOpenChange: () => {},
					hostUrls: [],
					sessionsByHost: {},
					bindingsByHost: {},
				}),
			);
		});

		// Root step: the preset is listed under "Start an agent".
		expect(screen.getByText("Deploy Bot")).toBeTruthy();

		await act(async () => {
			fireEvent.click(screen.getByText("Deploy Bot"));
		});

		// Step 2: only proj-1 workspaces show (Alpha, Gamma) — proj-2's Beta
		// is filtered out by the preset's projectIds.
		expect(screen.getByText("Alpha")).toBeTruthy();
		expect(screen.getByText("Gamma")).toBeTruthy();
		expect(screen.queryByText("Beta")).toBeNull();

		// Gamma's host is unreachable — same disabled/reason convention "New
		// terminal in…" already uses, preserved through the step transition.
		expect(screen.getByText("Host unreachable")).toBeTruthy();
		const gammaItem = screen
			.getByText("Gamma")
			.closest('[data-slot="command-item"]');
		expect(gammaItem?.getAttribute("data-disabled")).toBe("true");
		const alphaItem = screen
			.getByText("Alpha")
			.closest('[data-slot="command-item"]');
		expect(alphaItem?.getAttribute("data-disabled")).not.toBe("true");

		// Root groups are gone while on step 2.
		expect(screen.queryByText("Start an agent")).toBeNull();

		await act(async () => {
			fireEvent.click(screen.getByText("Back to presets"));
		});

		// Back on the root step: the preset list and root groups are back
		// (Alpha reappears too — legitimately, as a "New terminal in…" row —
		// so the step-2-only content is what proves the step actually
		// changed, not Alpha's presence).
		expect(screen.getByText("Deploy Bot")).toBeTruthy();
		expect(screen.getByText("Start an agent")).toBeTruthy();
		expect(screen.queryByText("Back to presets")).toBeNull();
	});
});
