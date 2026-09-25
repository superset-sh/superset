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

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const PAGE_ID = "5d3f2a1e-0c7b-4a2d-9f11-6b8c0d4e7a52";
const WORKSPACE_ID = "ws-local";

interface Row {
	workspaceId: string;
	workspaceName: string | null;
	terminalId: string;
	agentId: string | null;
	sessionTitle: string | null;
	hostId: string;
}
type CloudWatch = { watching: boolean; agentId: string | null };

let rows: Row[] = [];
let cloudWatch: CloudWatch = { watching: false, agentId: null };
let navigated: Array<{ workspaceId: string; terminalId: string | undefined }> =
	[];

mock.module("renderer/hooks/host-service/usePageWatchersForPage", () => ({
	usePageWatchersForPage: () => rows,
}));
mock.module("renderer/lib/cloud-trpc", () => ({
	cloudTrpc: {
		page: { get: { useQuery: () => ({ data: { watch: cloudWatch } }) } },
	},
}));
mock.module("@tanstack/react-router", () => ({
	useNavigate: () => () => Promise.resolve(),
}));
mock.module(
	"renderer/routes/_authenticated/_dashboard/utils/workspace-navigation",
	() => ({
		navigateToWorkspace: (
			workspaceId: string,
			_navigate: unknown,
			options?: { search?: { terminalId?: string } },
		) => {
			navigated.push({
				workspaceId,
				terminalId: options?.search?.terminalId,
			});
			return Promise.resolve();
		},
	}),
);
mock.module(
	"renderer/routes/_authenticated/settings/agents/components/AgentsSettings/components/AgentIcon",
	() => ({ AgentIcon: () => null }),
);

const { act, cleanup, fireEvent, render, within } = await import(
	"@testing-library/react"
);
const { PageWatcherMenu } = await import("./PageWatcherMenu");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

beforeEach(() => {
	rows = [];
	cloudWatch = { watching: false, agentId: null };
	navigated = [];
});

function watcher(overrides: Partial<Row> = {}): Row {
	return {
		workspaceId: "ws-a",
		workspaceName: "Chat UI",
		terminalId: "term-1",
		agentId: "codex",
		sessionTitle: "Page watcher redesign",
		hostId: "host-1",
		...overrides,
	};
}

async function renderMenu() {
	let view!: ReturnType<typeof render>;
	await act(async () => {
		view = render(
			<PageWatcherMenu workspaceId={WORKSPACE_ID} pageId={PAGE_ID} />,
		);
	});
	return within(view.baseElement as HTMLElement);
}

async function openMenu() {
	const ui = await renderMenu();
	await act(async () => {
		fireEvent.pointerDown(
			ui.getByRole("button"),
			new Event("pointerdown", { bubbles: true }),
		);
	});
	return ui;
}

describe("a page nothing is watching", () => {
	test("shows no control at all, rather than a menu saying so", async () => {
		const ui = await renderMenu();
		expect(ui.queryByRole("button")).toBeNull();
	});
});

describe("a page one agent is watching", () => {
	beforeEach(() => {
		rows = [watcher()];
		cloudWatch = { watching: true, agentId: "codex" };
	});

	test("names the session and the workspace it sits in", async () => {
		const ui = await openMenu();
		expect(ui.getByText("Page watcher redesign")).toBeDefined();
		expect(ui.getByText("Chat UI")).toBeDefined();
	});

	test("does not put the agent's name on the trigger", async () => {
		const ui = await renderMenu();
		expect(ui.getByRole("button").textContent).not.toContain("codex");
	});

	test("opens that agent's terminal in its own workspace", async () => {
		const ui = await openMenu();
		await act(async () => {
			fireEvent.click(ui.getByText("Page watcher redesign"));
		});
		expect(navigated).toEqual([{ workspaceId: "ws-a", terminalId: "term-1" }]);
	});

	test("falls back to the agent's name when the session has no title", async () => {
		rows = [watcher({ sessionTitle: null })];
		const ui = await openMenu();
		expect(ui.getByText("codex")).toBeDefined();
	});
});

describe("a page several agents are watching", () => {
	beforeEach(() => {
		rows = [
			watcher(),
			watcher({
				workspaceId: "ws-b",
				workspaceName: "Onboarding flow",
				terminalId: "term-2",
				agentId: "claude",
				sessionTitle: "Onboarding copy pass",
				hostId: "host-2",
			}),
		];
		cloudWatch = { watching: true, agentId: "codex" };
	});

	test("counts them on the trigger", async () => {
		const ui = await renderMenu();
		expect(ui.getByRole("button").textContent).toContain("2");
	});

	test("lists every one of them", async () => {
		const ui = await openMenu();
		expect(ui.getByText("Page watcher redesign")).toBeDefined();
		expect(ui.getByText("Onboarding copy pass")).toBeDefined();
	});
});

describe("a watcher on a host this machine cannot reach", () => {
	beforeEach(() => {
		cloudWatch = { watching: true, agentId: "codex" };
	});

	test("still shows the badge, because comments do reach it", async () => {
		const ui = await renderMenu();
		expect(ui.getByRole("button")).toBeDefined();
	});

	test("says where it is instead of pretending nothing watches", async () => {
		const ui = await openMenu();
		expect(ui.getByText("On a host you can't reach")).toBeDefined();
		expect(ui.getByText("codex")).toBeDefined();
	});

	test("names it generically when the flag carries no agent", async () => {
		cloudWatch = { watching: true, agentId: null };
		const ui = await openMenu();
		expect(ui.getByText("An agent")).toBeDefined();
	});
});
