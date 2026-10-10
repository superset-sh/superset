import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { DiffStats } from "./useDiffStats";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const gitChangedSubscriptions: { workspaceId: string; enabled: boolean }[] = [];
let statusQueries = 0;

mock.module("../useWorkspaceEvent", () => ({
	useWorkspaceEvent: (
		event: string,
		workspaceId: string,
		_callback: unknown,
		enabled = true,
	) => {
		if (event === "git:changed") {
			gitChangedSubscriptions.push({ workspaceId, enabled });
		}
	},
}));

mock.module("../useWorkspaceHostUrl", () => ({
	useWorkspaceHostUrl: () => "http://127.0.0.1:4000",
}));

mock.module("renderer/lib/host-service-client", () => ({
	getHostServiceClientByUrl: () => ({
		git: {
			getStatus: {
				query: async () => {
					statusQueries += 1;
					return {
						againstBase: [{ path: "a.ts", additions: 3, deletions: 1 }],
						staged: [],
						unstaged: [],
					};
				},
			},
		},
	}),
}));

const { act, cleanup, render } = await import("@testing-library/react");
const { QueryClient, QueryClientProvider } = await import(
	"@tanstack/react-query"
);
const { useDiffStats } = await import("./useDiffStats");

const rendered: (DiffStats | null)[] = [];

function Probe({ live }: { live?: boolean }) {
	rendered.push(useDiffStats("workspace-1", { live }));
	return null;
}

async function renderProbe(live?: boolean) {
	const client = new QueryClient();
	render(
		<QueryClientProvider client={client}>
			<Probe live={live} />
		</QueryClientProvider>,
	);
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

afterEach(() => {
	cleanup();
	gitChangedSubscriptions.length = 0;
	rendered.length = 0;
	statusQueries = 0;
});

afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

describe("useDiffStats", () => {
	test("subscribes to git:changed by default so the stats stay live", async () => {
		await renderProbe();

		expect(gitChangedSubscriptions.length).toBeGreaterThan(0);
		expect(gitChangedSubscriptions.every((entry) => entry.enabled)).toBe(true);
	});

	test("a one-shot read fetches the stats without subscribing to git:changed", async () => {
		await renderProbe(false);

		expect(statusQueries).toBe(1);
		expect(rendered.at(-1)).toEqual({ additions: 3, deletions: 1 });
		expect(gitChangedSubscriptions.some((entry) => entry.enabled)).toBe(false);
	});
});
