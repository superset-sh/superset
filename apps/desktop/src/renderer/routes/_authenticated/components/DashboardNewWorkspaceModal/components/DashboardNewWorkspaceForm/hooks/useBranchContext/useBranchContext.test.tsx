import { afterEach, expect, mock, spyOn, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: Own the isolated consumer fixture.
import { mkdtempSync, rmSync } from "node:fs";
import type { ReactNode } from "react";

if (process.env.SUPERSET_U4_BRANCH_FIXTURE !== "1") {
	test("cloud branch consumer runs in isolated React and Query", () => {
		const cwd = mkdtempSync("/tmp/superset-u4-branches-");
		try {
			const child = Bun.spawnSync(
				[process.execPath, "--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: { PATH: process.env.PATH, SUPERSET_U4_BRANCH_FIXTURE: "1" },
					stdout: "pipe",
					stderr: "pipe",
					timeout: 20000,
				},
			);
			process.stdout.write(child.stdout);
			process.stderr.write(child.stderr);
			expect(child.exitCode).toBe(0);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	}, 25000);
} else {
	const { GlobalRegistrator } = await import("@happy-dom/global-registrator");
	GlobalRegistrator.register();
	Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
	const deny = () => {
		throw Error("U4 external operation denied");
	};
	globalThis.fetch = Object.assign(async () => deny(), { preconnect: deny });
	// biome-ignore lint/style/noRestrictedImports: Deny sockets before the application import.
	const net = await import("node:net");
	spyOn(net.Socket.prototype, "connect").mockImplementation(deny);
	spyOn(Bun, "spawn").mockImplementation(deny);
	spyOn(Bun, "spawnSync").mockImplementation(deny);
	mock.module("dotenv", () => ({ config: deny }));
	const { act, renderHook, waitFor, cleanup } = await import(
		"@testing-library/react"
	);
	const { QueryClient, QueryClientProvider } = await import(
		"@tanstack/react-query"
	);
	const clients: InstanceType<typeof QueryClient>[] = [];
	let organizationId = "org",
		fail = false,
		block: Promise<void> | undefined;
	const native = {
		provider: "gitlab" as const,
		organizationId: "org",
		environmentId: "native-env",
		project: {
			connectionId: "connection",
			projectId: "17",
			pathWithNamespace: "Acme/Team/Widget",
			cloneUrl: "https://git.fixture.invalid/Acme/Team/Widget.git",
			defaultBranch: "release",
		},
	};
	const gh = { owner: "Acme", name: "Widget", defaultBranch: "trunk" };
	const nativeCalls: Array<{
		organizationId: string;
		cloneUrl: string;
		query?: string;
		page: number;
	}> = [];
	const ghCalls: unknown[] = [],
		localCalls: unknown[] = [];
	mock.module("renderer/hooks/useActiveOrganizationId", () => ({
		useActiveOrganizationId: () => organizationId,
	}));
	mock.module("renderer/hooks/host-service/useHostTargetUrl", () => ({
		useHostUrl: (id: string | null) =>
			id ? `http://host.invalid/${id}` : "http://local.invalid",
	}));
	mock.module("renderer/lib/cloud-trpc", () => ({
		cloudTrpcClient: {
			cloudWorkspace: {
				listGitlabBranches: {
					query: async (input: (typeof nativeCalls)[number]) => {
						nativeCalls.push(input);
						await block;
						if (fail) throw Error("Owned branch failure");
						return {
							defaultBranch: "provider-default",
							items: [{ name: `${input.query || "branch"}-${input.page}` }],
							nextPage: input.page === 1 ? 2 : null,
						};
					},
				},
			},
		},
	}));
	mock.module("renderer/lib/host-service-client", () => ({
		getHostServiceClientByUrl: (url: string) => ({
			workspaceCreation: {
				searchRemoteBranches: {
					query: async (input: unknown) => {
						ghCalls.push({ url, input });
						return { items: ["gh-branch"] };
					},
				},
				searchBranches: {
					query: async (input: unknown) => {
						localCalls.push({ url, input });
						return {
							defaultBranch: "local-default",
							items: [],
							nextCursor: null,
						};
					},
				},
			},
		}),
	}));
	const { useBranchContext } = await import("./useBranchContext");
	function mount(
		repository: typeof native | typeof gh | null = native,
		hostId = "cloud",
	) {
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false, gcTime: 0 } },
		});
		clients.push(client);
		const view = renderHook(
			({ repository, hostId, query }) =>
				useBranchContext("project", hostId, query, "all", repository),
			{
				initialProps: { repository, hostId, query: "" },
				wrapper: ({ children }: { children: ReactNode }) => (
					<QueryClientProvider client={client}>{children}</QueryClientProvider>
				),
			},
		);
		return { ...view, client };
	}
	afterEach(() => {
		cleanup();
		for (const c of clients) c.clear();
		clients.length = 0;
		organizationId = "org";
		fail = false;
		block = undefined;
		nativeCalls.length = 0;
		ghCalls.length = 0;
		localCalls.length = 0;
	});
	test("native branch paging uses exact binding and provider default without gh", async () => {
		const view = mount();
		await waitFor(() =>
			expect(view.result.current.branches.map((x) => x.name)).toEqual([
				"branch-1",
			]),
		);
		expect(nativeCalls).toEqual([
			{
				organizationId: "org",
				cloneUrl: native.project.cloneUrl,
				query: undefined,
				page: 1,
			},
		]);
		expect(view.result.current.defaultBranch).toBe("provider-default");
		expect(view.result.current.hasNextPage).toBe(true);
		await act(async () => {
			await view.result.current.fetchNextPage();
		});
		await waitFor(() => {
			expect(view.result.current.branches.map((x) => x.name)).toEqual([
				"branch-1",
				"branch-2",
			]);
			expect(view.result.current.hasNextPage).toBe(false);
		});
		expect(nativeCalls[1]?.page).toBe(2);
		expect(ghCalls).toEqual([]);
		expect(localCalls).toEqual([]);
	});
	test("native query is paged server search and its key contains exact environment identity", async () => {
		const view = mount();
		await waitFor(() => expect(nativeCalls).toHaveLength(1));
		view.rerender({ repository: native, hostId: "cloud", query: "feature" });
		await waitFor(() =>
			expect(view.result.current.branches.map((x) => x.name)).toEqual([
				"feature-1",
			]),
		);
		expect(nativeCalls[1]).toEqual({
			organizationId: "org",
			cloneUrl: native.project.cloneUrl,
			query: "feature",
			page: 1,
		});
		const keys = view.client
			.getQueryCache()
			.getAll()
			.filter((q) => q.queryKey.includes("native-env"));
		expect(keys.length).toBeGreaterThan(0);
		expect(ghCalls).toEqual([]);
	});
	test("same project in another environment does not reuse selected branch pages", async () => {
		const view = mount();
		await waitFor(() => expect(view.result.current.branches).toHaveLength(1));
		let release!: () => void;
		block = new Promise((resolve) => {
			release = resolve;
		});
		view.rerender({
			repository: { ...native, environmentId: "other-env" },
			hostId: "cloud",
			query: "",
		});
		expect(view.result.current.branches).toEqual([]);
		await act(async () => {
			release();
		});
		await waitFor(() => expect(nativeCalls).toHaveLength(2));
		expect(ghCalls).toEqual([]);
	});
	test("retained next-page callback cannot fetch for a changed native owner or unmounted hook", async () => {
		const view = mount();
		await waitFor(() => expect(view.result.current.hasNextPage).toBe(true));
		const retained = view.result.current.fetchNextPage;
		organizationId = "other-org";
		view.rerender({ repository: native, hostId: "cloud", query: "" });
		await act(async () => {
			await retained();
		});
		expect(nativeCalls).toHaveLength(1);
		expect(view.result.current.branches).toEqual([]);
		view.unmount();
		await retained();
		expect(nativeCalls).toHaveLength(1);
	});
	test("native refetch errors hide old pages and an owned refetch can recover", async () => {
		const view = mount();
		await waitFor(() => expect(view.result.current.branches).toHaveLength(1));
		fail = true;
		await act(async () => {
			await view.client.refetchQueries();
		});
		await waitFor(() => {
			expect(view.result.current.isError).toBe(true);
			expect(view.result.current.branches).toEqual([]);
		});
		fail = false;
		await act(async () => {
			await view.client.refetchQueries();
		});
		await waitFor(() => expect(view.result.current.branches).toHaveLength(1));
	});
	test("GitHub preserves original key body default and no cloud API branch request", async () => {
		const view = mount(gh);
		await waitFor(() =>
			expect(view.result.current.branches.map((x) => x.name)).toEqual([
				"gh-branch",
			]),
		);
		expect(ghCalls).toEqual([
			{
				url: "http://local.invalid",
				input: { owner: "Acme", repo: "Widget", query: undefined },
			},
		]);
		expect(view.result.current.defaultBranch).toBe("trunk");
		expect(
			view.client.getQueryCache().find({
				queryKey: [
					"cloudBranches",
					"http://local.invalid",
					"Acme",
					"Widget",
					"",
				],
				exact: true,
			}),
		).toBeDefined();
		expect(nativeCalls).toEqual([]);
	});
	test("local branch query retains its original request", async () => {
		const view = mount(null, "host");
		await waitFor(() => expect(localCalls).toHaveLength(1));
		expect(localCalls).toEqual([
			{
				url: "http://host.invalid/host",
				input: {
					projectId: "project",
					query: undefined,
					cursor: undefined,
					limit: 50,
					refresh: true,
					filter: "all",
				},
			},
		]);
		expect(view.result.current.defaultBranch).toBe("local-default");
		expect(nativeCalls).toEqual([]);
		expect(ghCalls).toEqual([]);
	});
}
