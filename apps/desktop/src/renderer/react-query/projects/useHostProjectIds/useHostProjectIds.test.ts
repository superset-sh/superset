import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

const listMock = mock<() => Promise<Array<{ id: string }>>>(async () => []);

const realHostServiceClient = await import("renderer/lib/host-service-client");
mock.module("renderer/lib/host-service-client", () => ({
	...realHostServiceClient,
	getHostServiceClientByUrl: () => ({
		project: { list: { query: listMock } },
	}),
}));

const {
	HOST_PROJECT_LIST_RETRY_MS,
	hostProjectIdsQueryOptions,
	hostProjectListQueryKey,
} = await import("./useHostProjectIds");

const HOST_URL = "http://relay.test/hosts/org:mini";

describe("hostProjectIdsQueryOptions", () => {
	let queryClient: QueryClient;

	beforeEach(() => {
		listMock.mockReset();
		queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
	});

	afterEach(() => {
		queryClient.clear();
	});

	it("resolves to the set of project ids the host reports", async () => {
		listMock.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
		const ids = await queryClient.fetchQuery(
			hostProjectIdsQueryOptions(HOST_URL),
		);
		expect([...ids].sort()).toEqual(["p1", "p2"]);
	});

	it("keeps an unreachable host in the error state instead of caching a result", async () => {
		listMock.mockRejectedValue(new Error("Host is not online"));
		await expect(
			queryClient.fetchQuery(hostProjectIdsQueryOptions(HOST_URL)),
		).rejects.toThrow("Host is not online");
		const state = queryClient.getQueryState(hostProjectListQueryKey(HOST_URL));
		expect(state?.status).toBe("error");
		expect(state?.data).toBeUndefined();
	});

	it("polls while the host is unreachable and stops once it answers", async () => {
		const options = hostProjectIdsQueryOptions(HOST_URL);
		const observer = new QueryObserver(queryClient, options);
		const unsubscribe = observer.subscribe(() => {});
		listMock.mockRejectedValue(new Error("Host is not online"));
		await queryClient.fetchQuery(options).catch(() => undefined);
		const query = observer.getCurrentQuery();
		const interval = observer.options.refetchInterval;
		if (typeof interval !== "function") {
			throw new Error("refetchInterval should be computed from query state");
		}
		expect(interval(query)).toBe(HOST_PROJECT_LIST_RETRY_MS);

		listMock.mockResolvedValue([{ id: "p1" }]);
		await queryClient.refetchQueries({ queryKey: options.queryKey });
		expect(query.state.status).toBe("success");
		expect(interval(query)).toBe(false);
		unsubscribe();
	});
});
