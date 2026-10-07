import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";

if (process.env.TEST_MOBILE_GL_DETAIL !== "1") {
	test("mobile detail uses actual React Query in a cleared child", () => {
		const cwd = mkdtempSync("/tmp/mobile-detail-");
		try {
			const child = spawnSync(
				process.execPath,
				["--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: {
						PATH: "/usr/bin:/bin",
						TMPDIR: "/tmp",
						TEST_MOBILE_GL_DETAIL: "1",
					},
					timeout: 25000,
					stdio: "pipe",
				},
			);
			process.stdout.write(child.stdout);
			process.stderr.write(child.stderr);
			if (child.error) throw child.error;
			expect(child.status).toBe(0);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	}, 30000);
} else {
	globalThis.fetch = Object.assign(
		async () => {
			throw Error("outbound denied");
		},
		{ preconnect: () => {} },
	);
	const net = await import("node:net");
	spyOn(net.Socket.prototype, "connect").mockImplementation(() => {
		throw Error("socket denied");
	});
	const deny = () => {
		throw Error("native denied");
	};
	spyOn(Bun, "spawn").mockImplementation(deny);
	spyOn(Bun, "spawnSync").mockImplementation(deny);
	const cp = await import("node:child_process");
	for (const name of [
		"spawn",
		"spawnSync",
		"exec",
		"execSync",
		"execFile",
		"execFileSync",
	] as const)
		spyOn(cp, name).mockImplementation(deny);
	mock.module("dotenv", () => ({ config: deny }));
	mock.module("node:worker_threads", () => ({ Worker: deny }));
	const useLingui = () => ({
		t: (input: { message: string }) =>
			input.message === "Invalid GitLab merge request identity"
				? "Owned localized identity error"
				: input.message,
	});
	mock.module("@lingui/react/macro", () => ({ useLingui }));
	expect(
		Object.is((await import("@lingui/react/macro")).useLingui, useLingui),
	).toBe(true);
	const desktop = new URL(
		"../../../../../../../desktop/node_modules/",
		import.meta.url,
	);
	const { GlobalRegistrator } = await import(
		new URL("@happy-dom/global-registrator/lib/index.js", desktop).href
	);
	GlobalRegistrator.register();
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	const React = await import("react");
	const { createRoot } = await import(
		new URL("react-dom/client.js", desktop).href
	);
	const { QueryClient, QueryClientProvider } = await import(
		"@tanstack/react-query"
	);
	let host = {
		organizationId: "org",
		machineId: "cloud:workspace",
		isOnline: true,
	};
	let workspace = { id: "workspace", projectId: "project" };
	let waking = false;
	let projectRows = [
		{
			id: "project",
			repoPath: "/repo",
			name: "Repo",
			icon: null,
			repoOwner: "Group/Sub",
			repoName: "Repo",
			repoUrl: "https://git.example:8443/Group/Sub/Repo.git",
		},
	];
	let projectDeferred: Promise<typeof projectRows> | null = null;
	let params: Record<string, string> = { id: "workspace", pullRequestId: "17" };
	const useWorkspaceHost = () => ({
		host,
		workspace,
		isResolving: false,
		sandboxWaking: waking,
		sandboxUnreachable: false,
	});
	const hostModule = new URL(
		"../../../../../../hooks/useWorkspaceHost/index.ts",
		import.meta.url,
	).pathname;
	for (const id of ["@/hooks/useWorkspaceHost", hostModule])
		mock.module(id, () => ({ useWorkspaceHost }));
	const requests: { url: string; input: Record<string, unknown> }[] = [];
	const gh = {
		pullRequest: {
			id: "gh",
			number: 17,
			title: "GH",
			body: "body",
			url: "https://github.com/Owner/Repo/pull/17",
			baseBranch: "main",
			state: "merged",
			isDraft: false,
			additions: 2,
			deletions: 1,
			changedFiles: 1,
			mergedAt: "2026-10-04T00:00:00Z",
			mergedBy: { login: "user", avatarUrl: null },
		},
		checks: [
			{
				name: "CI",
				status: "COMPLETED",
				conclusion: "SUCCESS",
				isRequired: true,
				startedAt: "2026-10-04T00:00:00Z",
				completedAt: null,
				detailsUrl: null,
			},
		],
		reviewers: [
			{ login: "user", avatarUrl: null, isTeam: false, state: "APPROVED" },
		],
		mergeability: {
			mergeable: "MERGEABLE",
			mergeStateStatus: "CLEAN",
			approvals: 1,
			requiredApprovals: 1,
			reviewDecision: "APPROVED",
			unresolvedThreads: 0,
			requiresThreadResolution: false,
			queue: null,
			allowedMergeMethods: ["merge"],
		},
		capabilities: {
			merge: true,
			markReady: false,
			updateBranch: true,
			reopen: false,
			dequeue: false,
		},
	};
	const gl = {
		...gh,
		provider: "gitlab",
		host: "git.example:8443",
		pullRequest: {
			...gh.pullRequest,
			id: "gitlab:17",
			url: "https://git.example:8443/Group/Sub/Repo/-/merge_requests/17",
			diffStatsComplete: false,
		},
		checks: [
			{
				name: "CI",
				status: "COMPLETED",
				conclusion: "SUCCESS",
				isRequired: false,
				startedAt: null,
				completedAt: null,
				detailsUrl: null,
			},
		],
		mergeability: { ...gh.mergeability, allowedMergeMethods: ["squash"] },
		reviewState: {
			provider: "gitlab",
			detailedMergeStatus: "mergeable",
			approvalsRequired: 1,
			approvalsLeft: 0,
			approvedBy: ["user"],
			blockingDiscussionsResolved: true,
			hasConflicts: false,
		},
		mergePolicy: { provider: "gitlab", method: "merge", squash: "always" },
	};
	let reply: unknown = gl;
	let deferred: Promise<unknown> | null = null;
	const getHostServiceClientByUrl = (url: string) => ({
		project: { list: { query: async () => projectDeferred ?? projectRows } },
		github: {
			getPullRequestDetail: {
				query: async (input: Record<string, unknown>) => {
					requests.push({ url, input });
					return deferred ?? reply;
				},
			},
		},
	});
	const hostServiceUrl = (org: string, machine: string) =>
		`https://broker.example/${org}/${machine}`;
	const clientModule = new URL(
		"../../../../../../lib/host-service/client.ts",
		import.meta.url,
	).pathname;
	for (const id of ["@/lib/host-service/client", clientModule])
		mock.module(id, () => ({ getHostServiceClientByUrl, hostServiceUrl }));
	mock.module("expo-router", () => ({ useLocalSearchParams: () => params }));
	expect(
		Object.is(
			(await import("@/hooks/useWorkspaceHost")).useWorkspaceHost,
			useWorkspaceHost,
		),
	).toBe(true);
	expect(
		Object.is(
			(await import("@/lib/host-service/client")).getHostServiceClientByUrl,
			getHostServiceClientByUrl,
		),
	).toBe(true);
	const projectsModule = await import(
		"../../../../../../hooks/useHostProjects/useHostProjects"
	);
	mock.module("@/hooks/useHostProjects", () => projectsModule);
	const {
		useWorkspacePullRequestDetail: useDetail,
		getPullRequestDetailQueryKey,
	} = await import("./useWorkspacePullRequestDetail");
	const { usePullRequestRoute } = await import(
		"../../pull-request/[pullRequestId]/usePullRequestRoute"
	);
	let client: InstanceType<typeof QueryClient>;
	let root: ReturnType<typeof createRoot> | null = null;
	const base = {
		workspaceId: "workspace",
		owner: "Group/Sub",
		repo: "Repo",
		pullNumber: 17,
		provider: "gitlab" as const,
		projectId: "project",
		repoUrl: "https://git.example:8443/Group/Sub/Repo.git",
		expectedUrl: "https://git.example:8443/Group/Sub/Repo/-/merge_requests/17",
	};
	let input: Parameters<typeof useDetail>[0] = { ...base };
	let result: ReturnType<typeof useDetail>;
	let route: ReturnType<typeof usePullRequestRoute>;
	function DetailProbe() {
		result = useDetail(input);
		return null;
	}
	function RouteProbe() {
		route = usePullRequestRoute();
		return null;
	}
	async function mount(routeMode = false) {
		client = new QueryClient({
			defaultOptions: { queries: { retry: false, gcTime: 0 } },
		});
		const node = document.createElement("div");
		document.body.append(node);
		root = createRoot(node);

		await React.act(async () =>
			root.render(
				React.createElement(
					QueryClientProvider,
					{ client },
					React.createElement(routeMode ? RouteProbe : DetailProbe),
				),
			),
		);
		await settle();
	}
	async function settle() {
		await React.act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 20));
		});
	}
	async function rerender() {
		await React.act(async () =>
			root?.render(
				React.createElement(
					QueryClientProvider,
					{ client },
					React.createElement(DetailProbe),
				),
			),
		);
		await settle();
	}
	afterEach(async () => {
		await React.act(async () => root?.unmount());
		root = null;
		client?.clear();
		requests.length = 0;
		input = { ...base };
		reply = gl;
		deferred = null;
		projectDeferred = null;
		params = { id: "workspace", pullRequestId: "17" };
		host = {
			organizationId: "org",
			machineId: "cloud:workspace",
			isOnline: true,
		};
		workspace = { id: "workspace", projectId: "project" };
		waking = false;
		projectRows = [
			{
				id: "project",
				repoPath: "/repo",
				name: "Repo",
				icon: null,
				repoOwner: "Group/Sub",
				repoName: "Repo",
				repoUrl: "https://git.example:8443/Group/Sub/Repo.git",
			},
		];
	});
	test("GL detail emits complete current host context and preserves genuine provider fields", async () => {
		await mount();
		expect(requests[0]).toEqual({
			url: "https://broker.example/org/cloud:workspace",
			input: {
				owner: "Group/Sub",
				repo: "Repo",
				pullNumber: 17,
				provider: "gitlab",
				host: "git.example:8443",
				projectId: "project",
				workspaceId: "workspace",
				expectedUrl: base.expectedUrl,
			},
		});
		expect(result.gitlabDetail).toEqual(gl);
		expect(result.detail).toBeNull();
	});
	test("GH default retains exact request key and date conversion", async () => {
		reply = gh;
		input = {
			workspaceId: "workspace",
			owner: "Owner",
			repo: "Repo",
			pullNumber: 17,
		};
		await mount();
		expect(requests[0]?.input).toEqual({
			owner: "Owner",
			repo: "Repo",
			pullNumber: 17,
		});
		expect(getPullRequestDetailQueryKey("workspace", 17)).toEqual([
			"workspace-pull-request",
			"workspace",
			17,
		]);
		expect(result.detail?.pullRequest.mergedAt).toEqual(
			new Date("2026-10-04T00:00:00Z"),
		);
		expect(result.detail?.checks[0]?.startedAt).toEqual(
			new Date("2026-10-04T00:00:00Z"),
		);
		expect(result.gitlabDetail).toBeNull();
	});
	for (const url of [
		"https://git.example:8443/Group/Sub/Other/-/merge_requests/17",
		"https://@git.example:8443/Group/Sub/Repo/-/merge_requests/17",
		"https://%67it.example:8443/Group/Sub/Repo/-/merge_requests/17",
		"https://git.example:8443/Group/%2e%2e/Repo/-/merge_requests/17",
		"https://github.com/Group/Repo/-/merge_requests/17",
		`${base.expectedUrl}?x=1`,
		`${base.expectedUrl}#x`,
	])
		test(`refuses explicit GL identity ${url}`, async () => {
			input = { ...base, expectedUrl: url };
			await mount();
			expect(requests).toHaveLength(0);
			expect(result.detail).toBeNull();
			expect(result.gitlabDetail).toBeNull();
		});
	test("partial GL claim cannot run default GH query", async () => {
		input = { ...base, expectedUrl: undefined };
		await mount();
		expect(requests).toHaveLength(0);
	});
	test("wrong returned authority is never exposed", async () => {
		reply = {
			...gl,
			host: "other.example",
			pullRequest: {
				...gl.pullRequest,
				url: "https://other.example/Group/Sub/Repo/-/merge_requests/17",
			},
		};
		await mount();
		expect(result.gitlabDetail).toBeNull();
		expect(result.detail).toBeNull();
	});
	test("host transition cannot reuse GL cached detail", async () => {
		await mount();
		host = { ...host, machineId: "other" };
		reply = { ...gl, pullRequest: { ...gl.pullRequest, title: "Other host" } };
		await rerender();
		expect(requests.at(-1)?.url).toBe("https://broker.example/org/other");
		expect(result.gitlabDetail?.pullRequest.title).toBe("Other host");
	});
	test("project change while old response pending suppresses old detail", async () => {
		let resolve!: (value: unknown) => void;
		deferred = new Promise((r) => (resolve = r));
		await mount();
		input = { ...base, projectId: "other" };
		await rerender();
		await React.act(async () => resolve(gl));
		await settle();
		expect(result.gitlabDetail).toBeNull();
		expect(result.detail).toBeNull();
	});
	test("route retains selected project authority and full expected URL", async () => {
		params = {
			id: "workspace",
			pullRequestId: "17",
			provider: "gitlab",
			expectedUrl: base.expectedUrl,
		};
		await mount(true);
		expect(requests[0]?.input).toEqual({
			owner: "Group/Sub",
			repo: "Repo",
			pullNumber: 17,
			provider: "gitlab",
			host: "git.example:8443",
			projectId: "project",
			workspaceId: "workspace",
			expectedUrl: base.expectedUrl,
		});
		expect(route.gitlabDetail).toEqual(gl);
	});
	test("GL route rejects prefix IID and explicit slug conflict", async () => {
		params = {
			id: "workspace",
			pullRequestId: "17junk",
			provider: "gitlab",
			expectedUrl: base.expectedUrl,
			owner: "Other",
			repo: "Repo",
		};
		await mount(true);
		expect(requests).toHaveLength(0);
	});
	for (const url of [
		"https://git.example:8443/Group/./Sub/Repo/-/merge_requests/17",
		`${base.expectedUrl}?`,
		`${base.expectedUrl}#`,
	])
		test(`raw path/query ambiguity refuses ${url}`, async () => {
			input = { ...base, expectedUrl: url };
			await mount();
			expect(requests).toHaveLength(0);
		});
	test("explicit GH provider cannot bless a GL expected URL", async () => {
		input = { ...base, provider: "github" };
		await mount();
		expect(requests).toHaveLength(0);
	});
	test("partial route owner cannot override GL authority", async () => {
		params = {
			id: "workspace",
			pullRequestId: "17",
			provider: "gitlab",
			expectedUrl: base.expectedUrl,
			owner: "Foreign",
		};
		await mount(true);
		expect(requests).toHaveLength(0);
	});
	test("GL returned IID must match requested IID", async () => {
		reply = { ...gl, pullRequest: { ...gl.pullRequest, number: 18 } };
		await mount();
		expect(result.gitlabDetail).toBeNull();
		expect(result.detail).toBeNull();
	});
	test("manual refetch of malformed GL input cannot run GH", async () => {
		input = { ...base, expectedUrl: undefined };
		await mount();
		await React.act(async () => {
			await result.refetch();
		});
		expect(requests).toHaveLength(0);
	});
	test("GH route retains old explicit-history payload", async () => {
		reply = gh;
		params = {
			id: "workspace",
			pullRequestId: "17junk",
			owner: "Owner",
			repo: "Repo",
		};
		projectRows = [
			{ ...projectRows[0], repoUrl: "https://github.com/Current/Repo.git" },
		];
		await mount(true);
		expect(requests[0]?.input).toEqual({
			owner: "Owner",
			repo: "Repo",
			pullNumber: 17,
		});
		expect(route.detail?.pullRequest.id).toBe("gh");
	});
	test("offline waking retains loading without provider calls", async () => {
		host = { ...host, isOnline: false };
		waking = true;
		await mount();
		expect(result.isLoading).toBe(true);
		expect(requests).toHaveLength(0);
	});
	test("GL refetch preserves complete bound context and genuine capabilities", async () => {
		await mount();
		reply = { ...gl, capabilities: { ...gl.capabilities, merge: false } };
		await React.act(async () => {
			await result.refetch();
		});
		await settle();
		expect(requests).toHaveLength(2);
		expect(requests[1]?.input).toEqual(requests[0]?.input);
		expect(result.gitlabDetail?.capabilities.merge).toBe(false);
	});
	test("GL route keeps pending repository metadata loading without premature error", async () => {
		let resolve!: (rows: typeof projectRows) => void;
		projectDeferred = new Promise((r) => (resolve = r));
		params = {
			id: "workspace",
			pullRequestId: "17",
			provider: "gitlab",
			expectedUrl: base.expectedUrl,
		};
		await mount(true);
		expect(route.isLoading).toBe(true);
		expect(route.error).toBeNull();
		expect(requests).toHaveLength(0);
		await React.act(async () => resolve(projectRows));
		await settle();
		expect(route.gitlabDetail).toEqual(gl);
	});
	for (const expectedUrl of [
		"https://git.example/Group/Sub/Repo/-/merge_requests/17",
		"https://other.example:8443/Group/Sub/Repo/-/merge_requests/17",
		"https://git.example:8443/group/Sub/Repo/-/merge_requests/17",
		"https://git.example:8443/Group/Sub/Repo/-/merge_requests/18",
	])
		test(`complete authority mismatch refuses ${expectedUrl}`, async () => {
			input = { ...base, expectedUrl };
			await mount();
			expect(requests).toHaveLength(0);
		});
	test("cached GH result at same workspace IID cannot replace GL detail", async () => {
		await mount();
		client.setQueryData(["workspace-pull-request", "workspace", 17], {
			...gh,
			pullRequest: { ...gh.pullRequest, title: "Historical GH" },
		});
		await rerender();
		expect(result.detail).toBeNull();
		expect(result.gitlabDetail?.pullRequest.title).toBe("GH");
		expect(requests).toHaveLength(1);
	});
	test("failed GL refetch suppresses previously cached detail", async () => {
		await mount();
		reply = { ...gl, host: "other.example" };
		await React.act(async () => {
			await result.refetch();
		});
		await settle();
		expect(result.error).not.toBeNull();
		expect(result.gitlabDetail).toBeNull();
	});
	test("native identity refusal uses the active localized message", async () => {
		input = { ...base, expectedUrl: undefined };
		await mount();
		expect(result.error?.message).toBe("Owned localized identity error");
	});
	test("project normalization retains the native URL without a GitHub avatar", () => {
		expect(projectsModule.toHostProjectItem(projectRows[0])).toEqual({
			id: "project",
			name: "Repo",
			iconUrl: null,
			repoOwner: "Group/Sub",
			repoName: "Repo",
			repoUrl: "https://git.example:8443/Group/Sub/Repo.git",
			repoProvider: null,
		});
	});
}
