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

let activeOrganizationId = "org-a";
const realAuthClient = await import("renderer/lib/auth-client");
mock.module("renderer/lib/auth-client", () => ({
	...realAuthClient,
	authClient: {
		...realAuthClient.authClient,
		useSession: () => ({
			data: { session: { activeOrganizationId } },
		}),
	},
}));
mock.module("renderer/lib/analytics", () => ({
	track: () => {},
}));

// mock.module is process-wide, so a sibling file's auth mock can win; patch
// whichever client the component will import.
const { authClient } = await import("renderer/lib/auth-client");
authClient.useSession = (() => ({
	data: { session: { activeOrganizationId } },
})) as unknown as typeof authClient.useSession;

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
const { act, cleanup, fireEvent, render } = await import(
	"@testing-library/react"
);

// happy-dom has no WebGL, and the card's cover shader throws without it.
// Another test file may load the real shader first, so mock.module is too late.
function fakeWebGl(): unknown {
	const stub: object = new Proxy(() => stub, {
		get: (_target, key) =>
			key === Symbol.toPrimitive ? () => 0 : key === "then" ? undefined : stub,
	});
	return stub;
}
const realGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = fakeWebGl as never;
const hadVisualViewport = "visualViewport" in globalThis;
if (!hadVisualViewport)
	Object.assign(globalThis, { visualViewport: undefined });
afterAll(() => {
	HTMLCanvasElement.prototype.getContext = realGetContext;
	if (!hadVisualViewport) Reflect.deleteProperty(globalThis, "visualViewport");
});
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const { useV1MigrationStatusStore } = await import(
	"renderer/stores/v1-migration-status"
);
const { V1TerminalsNotice } = await import("./V1TerminalsNotice");
type Source = NonNullable<Parameters<typeof V1TerminalsNotice>[0]["source"]>;

let organizationCounter = 0;
beforeEach(() => {
	organizationCounter += 1;
	activeOrganizationId = `org-${organizationCounter}`;
	localStorage.clear();
	useV1MigrationStatusStore.setState({
		organizationId: null,
		status: "idle",
		attentionItems: [],
	});
});
afterEach(cleanup);

function source({
	paneIds = ["pane-1"],
	sessions = {},
	livePaneIds = [],
	stopped = [],
}: {
	paneIds?: string[];
	sessions?: Awaited<ReturnType<Source["readAgentSessions"]>>;
	livePaneIds?: string[];
	stopped?: string[][];
} = {}): Source {
	return {
		listMigratedPaneIds: async () => paneIds,
		readAgentSessions: async () => sessions,
		listLiveV1PaneIds: async () => livePaneIds,
		stopV1Sessions: async (ids) => {
			stopped.push(ids);
			return { failedPaneIds: [] };
		},
	};
}

async function renderNotice(input: Source) {
	const view = render(<V1TerminalsNotice source={input} />);
	await act(async () => {});
	return view;
}

function settlePass(status: "idle" | "running" = "idle") {
	act(() => {
		useV1MigrationStatusStore
			.getState()
			.setStatus(activeOrganizationId, status);
	});
}

describe("V1TerminalsNotice", () => {
	test("waits for the first pass, then shows the generic resume hint", async () => {
		const view = await renderNotice(source());
		expect(view.container.innerHTML).toBe("");

		settlePass("running");
		await act(async () => {});
		expect(view.container.innerHTML).toBe("");

		settlePass("idle");
		await act(async () => {});
		expect(view.container.textContent).toContain("Your terminals restarted");
		expect(view.container.textContent).toContain("claude --resume");
		expect(view.container.textContent).not.toContain("Superset resumes");
	});

	test("names the agents whose recorded sessions resume", async () => {
		const view = await renderNotice(
			source({
				sessions: {
					"pane-1": {
						agentId: "claude",
						agentSessionId: "s-1",
						prompted: true,
					},
					"pane-2": {
						agentId: "codex",
						agentSessionId: "s-2",
						prompted: true,
						endedAt: 1,
					},
				},
			}),
		);
		settlePass();
		await act(async () => {});
		const text = view.container.textContent ?? "";
		expect(text).toContain("Superset resumes the agent sessions it recorded");
		expect(text).toContain("Claude");
		expect(text).not.toContain("Codex");
	});

	test("offers to stop v1 terminals that still run, and stops them only on click", async () => {
		const stopped: string[][] = [];
		const view = await renderNotice(
			source({ livePaneIds: ["pane-1", "pane-9"], stopped }),
		);
		settlePass();
		await act(async () => {});
		const text = view.container.textContent ?? "";
		expect(text).toContain(
			"2 terminals from v1 are still running in the background",
		);
		expect(text).not.toContain("Your terminals restarted");
		expect(stopped).toEqual([]);

		await act(async () => {
			fireEvent.click(view.getByText("Stop them"));
		});
		expect(stopped).toEqual([["pane-1", "pane-9"]]);
		expect(view.container.textContent).toContain("Your terminals restarted");
	});

	test("dismissing leaves v1 terminals running and asks again next launch", async () => {
		const stopped: string[][] = [];
		const view = await renderNotice(
			source({ livePaneIds: ["pane-1"], stopped }),
		);
		settlePass();
		await act(async () => {});
		act(() => {
			fireEvent.click(view.getByLabelText("Dismiss"));
		});
		expect(view.container.innerHTML).toBe("");
		expect(stopped).toEqual([]);
		expect(
			localStorage.getItem(`v1-terminals-notice-${activeOrganizationId}`),
		).toBe("pending");
	});

	test("stays hidden without migrated terminals", async () => {
		const view = await renderNotice(source({ paneIds: [] }));
		settlePass();
		await act(async () => {});
		expect(view.container.innerHTML).toBe("");
		expect(
			localStorage.getItem(`v1-terminals-notice-${activeOrganizationId}`),
		).toBeNull();
	});

	test("yields this launch to the welcome card and shows on the next", async () => {
		localStorage.setItem(
			`v1-migration-welcome-pending-${activeOrganizationId}`,
			"1",
		);
		localStorage.setItem(`v1-migration-complete-${activeOrganizationId}`, "x");
		const view = await renderNotice(source());
		expect(view.container.innerHTML).toBe("");
		expect(
			localStorage.getItem(`v1-terminals-notice-${activeOrganizationId}`),
		).toBe("pending");
	});

	test("never shows for an org already on v2", async () => {
		localStorage.setItem(`v1-migration-complete-${activeOrganizationId}`, "x");
		const view = await renderNotice(source());
		expect(view.container.innerHTML).toBe("");
	});

	test("dismissal persists per org", async () => {
		const view = await renderNotice(source());
		settlePass();
		await act(async () => {});
		const button = view.getByText("Got it");
		act(() => {
			fireEvent.click(button);
		});
		expect(view.container.innerHTML).toBe("");
		expect(
			localStorage.getItem(`v1-terminals-notice-${activeOrganizationId}`),
		).toBe("dismissed");

		cleanup();
		const again = await renderNotice(source());
		expect(again.container.innerHTML).toBe("");
	});
});
