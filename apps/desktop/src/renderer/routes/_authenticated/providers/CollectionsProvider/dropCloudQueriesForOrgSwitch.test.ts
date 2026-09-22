import { describe, expect, it } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { dropCloudQueriesForOrgSwitch } from "./dropCloudQueriesForOrgSwitch";

const WAITING_BY_WORKSPACE_KEY = [
	["pageComment", "waitingByWorkspace"],
	{ type: "query" },
];
const PAGE_COMMENT_LIST_KEY = ["cloud", "pageComment", "list", "page-1"];
const LOCAL_WORKSPACES_KEY = [["workspace", "list"], { type: "query" }];

function testQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
		},
	});
}

async function until(
	predicate: () => boolean,
	description: string,
): Promise<void> {
	for (let attempt = 0; attempt < 200; attempt += 1) {
		if (predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
	throw new Error(`Timed out waiting for ${description}`);
}

function mountedObserver(
	client: QueryClient,
	queryKey: readonly unknown[],
	queryFn: () => Promise<unknown>,
): { observer: QueryObserver; unsubscribe: () => void } {
	const observer = new QueryObserver(client, { queryKey, queryFn });
	const unsubscribe = observer.subscribe(() => {});
	return { observer, unsubscribe };
}

describe("dropCloudQueriesForOrgSwitch", () => {
	it("clears a still-mounted observer's rows and refetches them", async () => {
		const client = testQueryClient();
		let organizationId = "org-a";
		const { observer, unsubscribe } = mountedObserver(
			client,
			WAITING_BY_WORKSPACE_KEY,
			async () => [`${organizationId}-row`],
		);

		await until(
			() => observer.getCurrentResult().data !== undefined,
			"the first organization's rows",
		);
		expect(observer.getCurrentResult().data).toEqual(["org-a-row"]);

		organizationId = "org-b";
		dropCloudQueriesForOrgSwitch(client);

		expect(observer.getCurrentResult().data).toBeUndefined();

		await until(
			() => observer.getCurrentResult().data !== undefined,
			"the second organization's rows",
		);
		expect(observer.getCurrentResult().data).toEqual(["org-b-row"]);

		unsubscribe();
	});

	it("clears cloud queries keyed under the flat cloud root", async () => {
		const client = testQueryClient();
		const { observer, unsubscribe } = mountedObserver(
			client,
			PAGE_COMMENT_LIST_KEY,
			async () => ["comment"],
		);

		await until(
			() => observer.getCurrentResult().data !== undefined,
			"the page comment list",
		);

		dropCloudQueriesForOrgSwitch(client);

		expect(observer.getCurrentResult().data).toBeUndefined();

		unsubscribe();
	});

	it("leaves queries outside the cloud routers untouched", async () => {
		const client = testQueryClient();
		const { observer, unsubscribe } = mountedObserver(
			client,
			LOCAL_WORKSPACES_KEY,
			async () => ["local-workspace"],
		);

		await until(
			() => observer.getCurrentResult().data !== undefined,
			"the local workspace list",
		);

		dropCloudQueriesForOrgSwitch(client);

		expect(observer.getCurrentResult().data).toEqual(["local-workspace"]);

		unsubscribe();
	});
});
