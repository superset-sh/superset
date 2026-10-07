import { afterEach, expect, mock, spyOn, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: Isolate genuine React and DOM globals in an owned test child.
import { spawnSync } from "node:child_process";
// biome-ignore lint/style/noRestrictedImports: Own and remove the test child's working directory.
import { mkdtempSync, rmSync } from "node:fs";
import type { ReactNode } from "react";
import type { PullRequestRef } from "renderer/lib/github/pullRequestRef";
import type { PullRequestDetail } from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestDetail";

if (process.env.SUPERSET_PR_PANE_DETAIL_FIXTURE !== "1") {
	test("workspace PR reads resolve the project on the workspace host", () => {
		const result = Bun.spawnSync({
			cmd: [process.execPath, "test", `${import.meta.dir}/fixtures/checks.tsx`],
			env: { ...process.env, NODE_ENV: "test" },
		});
		expect(
			result.exitCode,
			result.stdout.toString() + result.stderr.toString(),
		).toBe(0);
	});

	test("pane detail uses actual React queries in an isolated owned child", () => {
		const cwd = mkdtempSync("/tmp/superset-pane-detail-");
		try {
			const child = spawnSync(
				process.execPath,
				["--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_PR_PANE_DETAIL_FIXTURE: "1",
					},
					stdio: "pipe",
					timeout: 20000,
				},
			);
			if (child.stdout) process.stdout.write(child.stdout);
			if (child.stderr) process.stderr.write(child.stderr);
			if (child.error) throw child.error;
			expect(child.status).toBe(0);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	}, 25000);
} else {
	const { GlobalRegistrator } = await import("@happy-dom/global-registrator");
	GlobalRegistrator.register();
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	globalThis.fetch = Object.assign(
		async () => {
			throw Error("Pane detail outbound fetch denied");
		},
		{ preconnect: () => {} },
	);
	// biome-ignore lint/style/noRestrictedImports: Deny sockets before application imports.
	const socket = await import("node:net");
	const denySocket = spyOn(
		socket.Socket.prototype,
		"connect",
	).mockImplementation(() => {
		throw Error("Pane detail socket denied");
	});

	const deniedEnvironment = {
		config: () => {
			throw Error("Pane detail environment file denied");
		},
	};
	mock.module("dotenv", () => deniedEnvironment);
	expect((await import("dotenv")).config).toBe(deniedEnvironment.config);
	const denyNative = () => {
		throw Error("Pane detail native process denied");
	};
	spyOn(Bun, "spawn").mockImplementation(denyNative);
	spyOn(Bun, "spawnSync").mockImplementation(denyNative);
	const React = await import("react");
	const { useQuery, QueryClient, QueryClientProvider } = await import(
		"@tanstack/react-query"
	);
	const { observable } = await import("@trpc/server/observable");
	let rows: {
		id: string;
		repoOwner: string | null;
		repoName: string | null;
		repoUrl: string | null;
	}[] = [];
	let mergedRows = rows;
	let projectFailure = false;
	let pendingProjects: Promise<typeof rows> | undefined;
	let detailUrl = "";
	let detailFailure = false;
	let hostUrl = "https://owned-broker.invalid/sandbox";
	let apiEnabled: boolean[] = [];
	let hostCalls: { url: string; input: unknown }[] = [];
	let metadataCalls: { url: string; path: string }[] = [];
	let serial = 0;
	const workspace = { id: "workspace", projectId: "project" };
	const workspaceBoundary = { useWorkspace: () => ({ workspace, hostUrl }) };
	const orgBoundary = { useActiveOrganizationId: () => "org" };
	const hostClientBoundary = {
		getHostServiceClientByUrl: (url: string) => ({
			pullRequests: {
				getContent: {
					query: async (input: unknown) => {
						hostCalls.push({ url, input });
						if (detailFailure)
							throw Error("owned provider authentication failure");
						return {
							number: 7,
							url: detailUrl,
							title: "host detail",
							body: "body",
							state: "open",
							isDraft: false,
							author: "user",
							branch: "feature",
							baseBranch: "main",
							checks: [],
							checksStatus: "success",
							createdAt: "",
							updatedAt: "",
						};
					},
				},
			},
		}),
	};

	const apiReply = {
		repoFullName: "other/repo",
		number: 7,
		url: "https://github.com/other/repo/pull/7",
		title: "API detail",
		body: "API body",
		state: "open",
		isDraft: false,
		author: { login: "api-user", avatarUrl: null },
		head: { ref: "api-feature", repoFullName: "other/repo" },
		base: { ref: "main" },
		reviewDecision: null,
		checksStatus: "success",
		checks: [],
		createdAt: "",
		updatedAt: "",
	} satisfies PullRequestDetail;
	const cloudBoundary = {
		cloudTrpcClient: {
			integration: {
				github: {
					getPullRequest: {
						query: async () => {
							throw Error("GitLab cloud fallback denied");
						},
					},
				},
			},
		},
		cloudTrpc: {
			integration: {
				github: {
					getPullRequest: {
						useQuery: (
							input: unknown,
							options: {
								enabled: boolean;
								staleTime: number;
								refetchOnWindowFocus: boolean;
							},
						) => {
							apiEnabled.push(options.enabled);
							return useQuery({
								queryKey: ["owned-api", input],
								queryFn: async () => apiReply,
								...options,
							});
						},
					},
				},
			},
		},
	};
	const linguiBoundary = {
		useLingui: () => ({ t: ({ message }: { message: string }) => message }),
	};
	mock.module("renderer/hooks/host-projects/useHostProjects", () => ({
		useHostProjects: () => ({ projects: [], isReady: true }),
	}));
	for (const [name, value] of [
		["renderer/hooks/useActiveOrganizationId", orgBoundary],
		["renderer/lib/cloud-trpc", cloudBoundary],
		["renderer/lib/host-service-client", hostClientBoundary],
		[
			"renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider",
			workspaceBoundary,
		],
		["@lingui/react/macro", linguiBoundary],
	] as const) {
		mock.module(name, () => value);
		const imported = await import(name);
		for (const [key, entry] of Object.entries(value))
			expect(Reflect.get(imported, key)).toBe(entry);
	}
	mock.module(
		"renderer/providers/ElectronTRPCProvider/ElectronTRPCProvider",
		() => ({
			electronQueryClient: new QueryClient(),
		}),
	);
	mock.module(
		"renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarData/derivePullRequestQueryTargets",
		() => ({
			DASHBOARD_SIDEBAR_PULL_REQUEST_QUERY_KEY_PREFIX: [
				"dashboard-sidebar",
				"pull-requests",
			],
		}),
	);
	mock.module(
		"renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces/useAccessibleV2Workspaces",
		() => ({
			V2_WORKSPACES_PULL_REQUEST_QUERY_KEY_PREFIX: [
				"v2-workspaces",
				"pull-requests",
			],
		}),
	);
	const linksPath =
		"../../../../../../../../../../../../../../../packages/workspace-client/src/lib/hostServiceLinks";
	const originalLinks = await import(linksPath);
	const linksBoundary = {
		...originalLinks,
		createHostServiceLinks: ({ url }: { url: string }) => [
			() =>
				({ op }: { op: { path: string } }) =>
					observable((observer) => {
						metadataCalls.push({ url, path: op.path });
						if (!["project.list", "project.get"].includes(op.path))
							throw Error("Unexpected workspace endpoint");
						const finish = async () => {
							if (pendingProjects) await pendingProjects;
							if (projectFailure) {
								observer.error(Error("owned metadata failure"));
								return;
							}
							observer.next({
								result: {
									data:
										op.path === "project.get"
											? (mergedRows.find(
													(row) => row.id === workspace.projectId,
												) ?? null)
											: rows,
								},
							});
							observer.complete();
						};
						void finish();
						return () => {};
					}),
		],
	};

	mock.module(linksPath, () => linksBoundary);
	expect((await import(linksPath)).createHostServiceLinks).toBe(
		linksBoundary.createHostServiceLinks,
	);
	const { WorkspaceClientProvider, useWorkspaceClient } = await import(
		"@superset/workspace-client"
	);
	const refBoundary = await import("renderer/lib/github/pullRequestRef");
	expect(typeof refBoundary.isSamePullRequest).toBe("function");
	const { usePullRequestDetail } = await import(
		"renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestDetail"
	);
	expect(typeof usePullRequestDetail).toBe("function");
	const { usePullRequestPaneDetail } = await import(
		"./usePullRequestPaneDetail"
	);
	const { renderHook, waitFor, cleanup, act } = await import(
		"@testing-library/react"
	);
	const clients = new Set<
		ReturnType<typeof useWorkspaceClient>["queryClient"]
	>();
	function Probe({ children }: { children: ReactNode }) {
		const client = useWorkspaceClient();
		clients.add(client.queryClient);
		client.queryClient.setDefaultOptions({ queries: { retry: false } });
		return React.createElement(QueryClientProvider, {
			client: client.queryClient,
			children,
		});
	}
	function mount(ref: PullRequestRef) {
		const key = `owned-pane-${++serial}`;
		return renderHook(({ value }) => usePullRequestPaneDetail(value), {
			initialProps: { value: ref },
			wrapper: ({ children }) =>
				React.createElement(WorkspaceClientProvider, {
					cacheKey: key,
					hostUrl,
					children: React.createElement(Probe, { children }),
				}),
		});
	}
	const gl = {
		repoFullName: "group/sub/repo",
		number: 7,
		provider: "gitlab" as const,
		host: "gl.example:8443",
	};
	function prepare(ref = gl) {
		const row = {
			id: "project",
			repoOwner: "group/sub",
			repoName: "repo",
			repoUrl: `https://${ref.host}/group/sub/repo.git`,
		};
		rows = [row];
		mergedRows = rows;
		projectFailure = false;
		detailFailure = false;
		pendingProjects = undefined;
		detailUrl = `https://${ref.host}/group/sub/repo/-/merge_requests/7`;
		apiEnabled = [];
		hostCalls = [];
		metadataCalls = [];
		hostUrl = "https://owned-broker.invalid/sandbox";
		return row;
	}
	afterEach(() => {
		cleanup();
		for (const client of clients) client.clear();
		clients.clear();
	});
	test("GL cloud broker metadata wins merged foreign instance and preserves isFromHost", async () => {
		const row = prepare();
		mergedRows = [
			{ ...row, repoUrl: "https://foreign.invalid/group/sub/repo.git" },
		];
		const view = mount(gl);
		await waitFor(() =>
			expect(view.result.current.data?.title).toBe("host detail"),
		);
		expect(view.result.current.isFromHost).toBe(true);
		expect(metadataCalls).toEqual([
			{ url: `${hostUrl}/trpc`, path: "project.list" },
		]);
		expect(hostCalls).toEqual([
			{
				url: hostUrl,
				input: {
					projectId: "project",
					prNumber: 7,
					provider: "gitlab",
					expectedPullRequest: {
						projectId: "project",
						provider: "gitlab",
						host: gl.host,
						owner: "group/sub",
						repo: "repo",
						pullNumber: 7,
						expectedUrl: detailUrl,
					},
				},
			},
		]);
		expect(apiEnabled.every((enabled) => !enabled)).toBe(true);
	});
	test("GL operational content errors retain their original diagnostic and retry", async () => {
		prepare();
		detailFailure = true;
		const view = mount(gl);
		await waitFor(() => expect(view.result.current.isError).toBe(true));
		expect(view.result.current.error?.message).toContain(
			"owned provider authentication failure",
		);
		expect(view.result.current.error?.message).not.toContain("not found");
		detailFailure = false;
		await act(async () => {
			await view.result.current.refetch();
		});
		await waitFor(() =>
			expect(view.result.current.data?.title).toBe("host detail"),
		);
	});
	test("GL local workspace uses its own current URL for both endpoints", async () => {
		prepare();
		hostUrl = "http://127.0.0.1:54321";
		const view = mount(gl);
		await waitFor(() =>
			expect(view.result.current.data?.title).toBe("host detail"),
		);
		expect(metadataCalls[0]?.url).toBe(`${hostUrl}/trpc`);
		expect(hostCalls[0]?.url).toBe(hostUrl);
	});
	test.each([
		"foreign-host",
		"foreign-port",
		"wrong-case",
		"wrong-stored-owner",
		"missing-project",
	])("GL refuses %s settled metadata without enabling API", async (kind) => {
		const row = prepare();
		if (kind === "foreign-host")
			row.repoUrl = "https://foreign.invalid/group/sub/repo.git";
		if (kind === "foreign-port")
			row.repoUrl = "https://gl.example:9443/group/sub/repo.git";
		if (kind === "wrong-case")
			row.repoUrl = "https://gl.example:8443/Group/sub/repo.git";
		if (kind === "wrong-stored-owner") row.repoOwner = "wrong/sub";
		if (kind === "missing-project") rows = [];
		mergedRows = [
			{
				id: "project",
				repoOwner: "group/sub",
				repoName: "repo",
				repoUrl: "https://gl.example:8443/group/sub/repo.git",
			},
		];
		const view = mount(gl);
		await waitFor(() =>
			expect(view.result.current.error?.message).toBe(
				"Pull request not found.",
			),
		);
		expect(view.result.current.isLoading).toBe(false);
		expect(view.result.current.isFromHost).toBe(false);
		expect(view.result.current.data).toBeUndefined();
		expect(hostCalls).toEqual([]);
		expect(apiEnabled.every((enabled) => !enabled)).toBe(true);
	});
	test("GL project loading settles and metadata errors expose genuine refetch", async () => {
		prepare();
		let release = () => {};
		pendingProjects = new Promise((resolve) => {
			release = () => resolve(rows);
		});
		const view = mount(gl);
		expect(view.result.current.isLoading).toBe(true);
		expect(view.result.current.isFromHost).toBe(false);
		expect(hostCalls).toEqual([]);
		projectFailure = true;
		await act(async () => release());
		await waitFor(() =>
			expect(view.result.current.error?.message).toBe("owned metadata failure"),
		);
		expect(view.result.current.isLoading).toBe(false);
		projectFailure = false;
		await act(async () => {
			await view.result.current.refetch();
		});
		await waitFor(() =>
			expect(view.result.current.data?.title).toBe("host detail"),
		);
	});
	test.each([
		"missing-host",
		"encoded-host",
		"encoded-repo",
		"dot-repo",
	])("GL raw ref %s cannot normalize into another identity", async (kind) => {
		prepare();
		const ref = { ...gl };
		if (kind === "missing-host") delete (ref as PullRequestRef).host;
		if (kind === "encoded-host") ref.host = "gl%2eexample:8443";
		if (kind === "encoded-repo") ref.repoFullName = "group/sub/%72epo";
		if (kind === "dot-repo") ref.repoFullName = "group/sub/../repo";
		const view = mount(ref);
		await waitFor(() =>
			expect(view.result.current.error?.message).toBe(
				"Pull request not found.",
			),
		);
		expect(view.result.current.isFromHost).toBe(false);
		expect(hostCalls).toEqual([]);
		expect(apiEnabled.every((enabled) => !enabled)).toBe(true);
	});
	test.each([
		"foreign.invalid:8443",
		"gl.example:9443",
	])("GL suppresses stale returned URL %s and Code-tab host flag", async (host) => {
		prepare();
		detailUrl = `https://${host}/group/sub/repo/-/merge_requests/7`;
		const view = mount(gl);
		await waitFor(() =>
			expect(view.result.current.error?.message).toBe(
				"Pull request not found.",
			),
		);
		expect(view.result.current.data).toBeUndefined();
		expect(view.result.current.isFromHost).toBe(false);
		expect(apiEnabled.every((enabled) => !enabled)).toBe(true);
	});

	test("GL returned identity refusal retries actual content rather than only metadata", async () => {
		prepare();
		detailUrl = "https://foreign.invalid/group/sub/repo/-/merge_requests/7";
		const view = mount(gl);
		await waitFor(() =>
			expect(view.result.current.error?.message).toBe(
				"Pull request not found.",
			),
		);
		detailUrl = "https://gl.example:8443/group/sub/repo/-/merge_requests/7";
		await act(async () => {
			await view.result.current.refetch();
		});
		await waitFor(() =>
			expect(view.result.current.data?.title).toBe("host detail"),
		);
		expect(view.result.current.isFromHost).toBe(true);
		expect(hostCalls).toHaveLength(2);
	});
	test("detail cache separates complete GL identity and rejects changed returned URL", async () => {
		prepare();
		const key = `owned-detail-${++serial}`;
		const view = renderHook(
			({ value }) => ({
				...usePullRequestDetail({
					projectId: "project",
					hostUrl,
					prNumber: 7,
					expectedRef: value,
					projectQuery: { data: { id: "project" }, isPending: false },
				}),
			}),
			{
				initialProps: { value: gl },
				wrapper: ({ children }) =>
					React.createElement(WorkspaceClientProvider, {
						cacheKey: key,
						hostUrl,
						children: React.createElement(Probe, { children }),
					}),
			},
		);
		await waitFor(() =>
			expect(view.result.current.data?.title).toBe("host detail"),
		);
		detailUrl = "https://other.invalid/group/sub/repo/-/merge_requests/7";
		view.rerender({ value: { ...gl, host: "other.invalid" } });
		await waitFor(() => expect(hostCalls).toHaveLength(2));
		await waitFor(() => expect(view.result.current.data?.url).toBe(detailUrl));
		detailUrl = "https://foreign.invalid/group/sub/repo/-/merge_requests/7";
		await act(async () => {
			await view.result.current.refetch();
		});
		await waitFor(() => expect(view.result.current.isError).toBe(true));
		expect(view.result.current.error).toBeInstanceOf(Error);
	});

	test("fixture cleanup removes child-local DOM and socket guard", async () => {
		cleanup();
		denySocket.mockRestore();
		await GlobalRegistrator.unregister();
	});
}
