import { expect, mock, test } from "bun:test";
import type { DraftTrigger } from "@superset/shared/automation-triggers";
import {
	focusManager,
	QueriesObserver,
	QueryClient,
	type QueryObserverOptions,
} from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";

let captured: QueryObserverOptions[] = [];
let connected = false;
let nativeFetches = 0;
let githubFetches = 0;
let transportClient: QueryClient | undefined;
const queries = await import("@tanstack/react-query");
mock.module("@tanstack/react-query", () => ({
	...queries,
	useQueries: ({ queries: options }: { queries: QueryObserverOptions[] }) => {
		captured = options;
		return [];
	},
}));
mock.module("renderer/lib/cloud-trpc", () => ({
	cloudTrpc: {
		useUtils: () => ({
			integration: {
				triggerOptions: {
					fetch: async (
						input: { organizationId: string; group: string },
						options?: { staleTime?: number },
					) => {
						if (!transportClient)
							throw new Error("Missing actual shared query client");
						return transportClient.fetchQuery({
							queryKey: [
								["integration", "triggerOptions"],
								{ input, type: "query" },
							],
							queryFn: async () => {
								expect(input.organizationId).toBe("org-selected");
								if (input.group === "gitlab") {
									nativeFetches++;
									return {
										projects: connected
											? [{ id: "Team/Widget", label: "Widget" }]
											: [],
									};
								}
								if (input.group !== "github")
									throw new Error("Unexpected option group");
								githubFetches++;
								return {
									repositories: [{ id: "123", label: "Original GitHub" }],
								};
							},
							...options,
						});
					},
				},
			},
		}),
	},
}));
const { useProviderOptions } = await import("./useProviderOptions");
const drafts: DraftTrigger[] = [
	{
		config: {
			kind: "gitlab",
			event: "merge_request.opened",
			projects: { mode: "list", ids: ["Team/Widget"] },
			branches: { mode: "any" },
			labels: { mode: "any" },
			includeForks: false,
		},
	},
	{
		config: {
			kind: "github",
			event: "pull_request.opened",
			repositories: { mode: "list", ids: ["123"] },
			branches: { mode: "any" },
			labels: { mode: "any" },
			actor: { mode: "any" },
			includeForks: false,
		},
	},
];
function Fixture() {
	useProviderOptions("org-selected", drafts);
	return null;
}

async function waitFor(condition: () => boolean) {
	for (let attempt = 0; attempt < 100; attempt++) {
		if (condition()) return;
		await new Promise((resolve) => setTimeout(resolve, 1));
	}
	throw new Error("Expected query lifecycle completion");
}

test("returning from native connect bypasses nested tRPC freshness without changing GitHub", async () => {
	connected = false;
	nativeFetches = githubFetches = 0;
	renderToStaticMarkup(<Fixture />);
	const native = captured.find((query) => query.queryKey?.at(-1) === "gitlab");
	const github = captured.find((query) => query.queryKey?.at(-1) === "github");
	if (!native || !github) throw new Error("Expected both actual option groups");
	expect(github.staleTime).toBe(300_000);
	expect(github.refetchOnWindowFocus).toBeUndefined();
	const previousFocus = focusManager.isFocused();
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	client.setQueryDefaults([["integration"]], { staleTime: 30_000 });
	transportClient = client;
	client.mount();
	const observer = new QueriesObserver(client, captured);
	const unsubscribe = observer.subscribe(() => {});
	try {
		await waitFor(() =>
			observer.getCurrentResult().every((result) => result.isSuccess),
		);
		expect(nativeFetches).toBe(1);
		expect(githubFetches).toBe(1);
		focusManager.setFocused(false);
		connected = true;
		focusManager.setFocused(true);
		await waitFor(
			() =>
				nativeFetches === 2 &&
				observer.getCurrentResult().every((result) => !result.isFetching),
		);
		expect(
			client.getQueryData<{ projects: { id: string; label: string }[] }>(
				native.queryKey,
			),
		).toEqual({
			projects: [{ id: "Team/Widget", label: "Widget" }],
		});
		expect(githubFetches).toBe(1);
		expect(native.staleTime).toBe(0);
		expect(native.refetchOnWindowFocus).toBe(true);
	} finally {
		unsubscribe();
		client.unmount();
		client.clear();
		transportClient = undefined;
		focusManager.setFocused(previousFocus);
	}
});
