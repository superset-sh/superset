import { expect, mock, spyOn } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";

export function runMobileM2Child(path: string) {
	const cwd = mkdtempSync("/tmp/mobile-m2-");
	try {
		const child = spawnSync(process.execPath, ["--no-env-file", "test", path], {
			cwd,
			env: { PATH: "/usr/bin:/bin", TMPDIR: "/tmp", TEST_MOBILE_M2: "1" },
			timeout: 25000,
			stdio: "pipe",
		});
		process.stdout.write(child.stdout);
		process.stderr.write(child.stderr);
		if (child.error) throw child.error;
		expect(child.status).toBe(0);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

export async function mobileM2Fixture() {
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
	const mobile = new URL("../../", import.meta.url);
	const desktop = new URL("../desktop/node_modules/", mobile);
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
	const nativeUrl =
		"https://git.example:8443/Group/Sub/Repo/-/merge_requests/17";
	const nativeRow = {
		key: `gitlab:${nativeUrl}`,
		provider: "gitlab" as const,
		host: "git.example:8443",
		expectedUrl: nativeUrl,
		repoOwner: "Group/Sub",
		repoName: "Repo",
		prNumber: 17,
		url: nativeUrl,
		title: "Native",
		state: "open" as const,
		isDraft: false,
		headBranch: "feature",
		mergedAt: null,
		linkedAt: 3,
		isCurrent: true,
	};
	const githubRow = {
		...nativeRow,
		key: "Owner/Repo#17",
		provider: undefined,
		host: undefined,
		expectedUrl: undefined,
		repoOwner: "Owner",
		url: "https://github.com/Owner/Repo/pull/17",
		title: "GitHub",
	};
	const state = {
		host: {
			organizationId: "org",
			machineId: "cloud:workspace",
			isOnline: true,
		},
		workspace: { id: "workspace", projectId: "project", worktreePath: "/repo" },
		history: [nativeRow],
		rows: [nativeRow],
		detail: {
			provider: "gitlab",
			host: "git.example:8443",
			pullRequest: {
				number: 17,
				url: nativeUrl,
				additions: 7,
				deletions: 2,
				diffStatsComplete: true,
			},
		},
		ghDetail: { additions: 4, deletions: 1 },
		deferred: null as Promise<unknown> | null,
		pushes: [] as unknown[],
		replaces: [] as unknown[],
		externals: [] as string[],
		requests: [] as { url: string; method: string; input: unknown }[],
		projectReads: 0,
		presses: [] as (() => void)[],
		composer: null as null | Record<string, unknown>,
		diffstats: [] as Record<string, unknown>[],
	};
	const initialDetail = state.detail;
	const leaves = new Map<string, Record<string, unknown>>();
	const mockLeaf = (
		id: string,
		value: Record<string, unknown>,
		source?: URL,
	) => {
		leaves.set(id, value);
		mock.module(id, () => value);
		const path = id.startsWith("@/")
			? new URL(id.slice(2), mobile).pathname
			: id.startsWith(".") && source
				? new URL(id, source).pathname
				: null;
		if (path) leaves.set(path, value);
		if (path)
			for (const variant of [
				path,
				`${path}.ts`,
				`${path}.tsx`,
				`${path}/index.ts`,
				`${path}/index.tsx`,
			])
				mock.module(variant, () => value);
	};
	const router = {
		push: (input: unknown) => state.pushes.push(input),
		replace: (input: unknown) => state.replaces.push(input),
		back: () => {},
		canGoBack: () => true,
	};
	const empty = () => null;
	const View = ({ children }: { children?: React.ReactNode }) =>
		React.createElement("div", null, children);
	const Text = View;
	const Pressable = (props: Record<string, unknown>) => {
		if (typeof props.onPress === "function")
			state.presses.push(props.onPress as () => void);
		return React.createElement(View, props);
	};
	const Stack = Object.assign(View, {
		Screen: empty,
		Toolbar: Object.assign(View, {
			Button: empty,
			Menu: View,
			MenuAction: View,
		}),
	});
	mockLeaf("expo-router", {
		useRouter: () => router,
		useLocalSearchParams: () => ({ id: "workspace" }),
		Stack,
	});
	mockLeaf("react-native", {
		View,
		Text,
		Pressable,
		ScrollView: View,
		ActivityIndicator: empty,
		Alert: { alert: deny, prompt: deny },
		Dimensions: { get: () => ({ width: 390, height: 800 }) },
		Keyboard: { addListener: () => ({ remove: () => {} }) },
		LayoutAnimation: {
			configureNext: () => {},
			Types: { keyboard: "keyboard" },
		},
	});
	mockLeaf("@/components/ui/text", { Text });
	mockLeaf("@/components/ui/icon", { Icon: empty });
	const useWorkspaceHost = () => ({
		host: state.host,
		workspace: state.workspace,
		cloud: null,
		isResolving: false,
		sandboxWaking: false,
		sandboxUnreachable: false,
	});
	mockLeaf("@/hooks/useWorkspaceHost", { useWorkspaceHost });
	mockLeaf("@/lib/env", {
		env: { EXPO_PUBLIC_WEB_URL: "https://app.example" },
	});
	mockLeaf("@/lib/open-url", {
		openUrl: (url: string) => state.externals.push(url),
	});
	mockLeaf("@/lib/page-links", { pageSlugFromUrl: () => null });
	mockLeaf("@lingui/react/macro", {
		useLingui: () => ({ t: ({ message }: { message: string }) => message }),
		Trans: View,
	});
	mockLeaf("@lingui/core/macro", { msg: (input: unknown) => input });
	const hostServiceUrl = (org: string, machine: string) =>
		`https://broker.example/${org}/${machine}`;
	const query =
		(url: string, method: string, reply: () => unknown) =>
		async (input: unknown) => {
			state.requests.push({ url, method, input });
			return state.deferred ?? reply();
		};
	const getHostServiceClientByUrl = (url: string) => ({
		pullRequests: {
			historyByWorkspaces: {
				query: query(url, "history", () => ({
					workspaces: [
						{
							pullRequests: state.history.map((row) => ({
								...row,
								number: row.prNumber,
							})),
						},
					],
				})),
			},
		},
		github: {
			getPR: { query: query(url, "getPR", () => state.ghDetail) },
			getPullRequestDetail: {
				query: query(url, "getPullRequestDetail", () => state.detail),
			},
		},
	});
	mockLeaf("@/lib/host-service/client", {
		hostServiceUrl,
		getHostServiceClientByUrl,
	});
	expect(
		Object.is(
			(await import("@/lib/host-service/client")).getHostServiceClientByUrl,
			getHostServiceClientByUrl,
		),
	).toBe(true);
	mockLeaf("@/screens/(authenticated)/workspace/[id]/hooks/useWorkspaceRepo", {
		useWorkspaceRepo: () => ({
			projectId: "project",
			repoUrl: "https://git.example:8443/Group/Sub/Repo.git",
			owner: "Group/Sub",
			repo: "Repo",
			isReady: true,
		}),
	});
	let root: ReturnType<typeof createRoot> | null = null;
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: 0 } },
	});
	const render = async (component: React.ComponentType) => {
		state.presses = [];
		state.diffstats = [];
		if (!root) {
			const node = document.createElement("div");
			document.body.append(node);
			root = createRoot(node);
		}
		await React.act(async () =>
			root?.render(
				React.createElement(
					QueryClientProvider,
					{ client },
					React.createElement(component),
				),
			),
		);
		await settle();
	};
	const settle = async () => {
		await React.act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 20));
		});
	};
	const cleanup = async () => {
		await React.act(async () => root?.unmount());
		client.clear();
		root = null;
		document.body.textContent = "";
		state.requests = [];
		state.projectReads = 0;
		state.pushes = [];
		state.replaces = [];
		state.externals = [];
		state.presses = [];
		state.diffstats = [];
		state.composer = null;
		state.deferred = null;
		state.detail = initialDetail;
		state.host = {
			organizationId: "org",
			machineId: "cloud:workspace",
			isOnline: true,
		};
		state.rows = [nativeRow];
		state.history = [nativeRow];
	};
	const mockHistoryRows = (source: URL) =>
		mockLeaf(
			"../hooks/useWorkspacePullRequest",
			{ useWorkspacePullRequests: () => state.rows },
			source,
		);
	const setupScreen = (source: URL) => {
		const text = readFileSync(source, "utf8");
		const stableRows = new Map([
			[
				"workspace",
				[
					{
						terminalId: "terminal",
						agentId: null,
						definitionId: null,
						title: "Shell",
						attention: null,
						lastEventAt: null,
					},
				],
			],
		]);
		const store = {
			orderByWorkspace: {},
			tabByWorkspace: {},
			hasHydrated: true,
			pendingById: {},
			pinnedAt: {},
			setLastSessionTab: () => {},
			clear: () => {},
			fail: () => {},
			togglePin: () => {},
			clearManualUnread: () => {},
			markCloudRead: () => {},
			setManualUnread: () => {},
			markTerminalSeen: () => {},
		};
		const storeHook = Object.assign(
			(select: (input: typeof store) => unknown) => select(store),
			{ getState: () => store },
		);
		const overrides: Record<string, unknown> = {
			TitlePress: View,
			i18n: { _: (value: { message: string }) => value.message },
			posthog: { capture: () => {} },
			useSafeAreaInsets: () => ({ bottom: 0 }),
			useArchivedCloudWorkspaces: () => ({ workspaces: [] }),
			useHostTerminals: () => ({
				terminalsByWorkspace: stableRows,
				isReady: true,
				isError: false,
			}),
			getHostTerminalsQueryKey: () => ["terminals"],
			getHostWorkspacesQueryKey: () => ["workspaces"],
			useAgentIconUris: () => ({}),
			useCreateTerminalWorkspace: () => ({ mutate: deny }),
			useSlashCommands: () => [],
			workspaceDraftKey: () => "workspace",
			useHostCompatibility: () => ({ incompatible: false }),
			usePullRequestIconUri: () => null,
			useWorkspaceHeaderActions: () => ({}),
			useWorkspacePullRequests: () => state.rows,
			TerminalComposer: (props: Record<string, unknown>) => {
				state.composer = props;
				return null;
			},
			TerminalWebView: empty,
			orderTerminalRows: (rows: unknown) => rows,
			PULL_REQUEST_SYMBOL: { open: "open" },
			pullRequestStatus: () => "open",
		};
		for (const match of text.matchAll(
			/import\s+(?!type\s)([\s\S]*?)\s+from\s+["']([^"']+)["'];/g,
		)) {
			const [, clause, id] = match;
			if (
				[
					"react",
					"@tanstack/react-query",
					"expo-router",
					"react-native",
					"@lingui/react/macro",
					"@lingui/core/macro",
					"@/hooks/useWorkspaceHost",
					"@/lib/host-service/client",
					"@/components/ui/icon",
					"@/components/ui/text",
					"@/lib/pull-request-links",
				].includes(id)
			)
				continue;
			const names = clause
				.replace(/[{}]/g, "")
				.split(",")
				.map((n) => n.trim())
				.filter((n) => n && !n.startsWith("type "))
				.map((n) => n.split(/\s+as\s+/)[0]);
			const exports: Record<string, unknown> =
				id === "expo-clipboard" ? { setStringAsync: deny } : {};
			for (const name of names.filter((name) => name !== "*"))
				exports[name] =
					overrides[name] ?? (name.endsWith("Store") ? storeHook : empty);
			mockLeaf(id, exports, source);
		}
	};
	const loadConsumer = async (source: URL) => {
		const cwd = mkdtempSync("/tmp/mobile-m2-source-");
		const original = readFileSync(source, "utf8");
		let index = 0;
		symlinkSync(
			new URL("node_modules", mobile).pathname,
			`${cwd}/node_modules`,
			"dir",
		);
		const relocated = original
			.replace(/import type[\s\S]*?from\s+["'][^"']+["'];/g, "")
			.replace(/(from\s+["'])([^"']+)(["'])/g, (_match, before, id, after) => {
				if (id === "react" || id === "@tanstack/react-query")
					return before + id + after;
				if (id === "@/lib/pull-request-links")
					return (
						before +
						new URL("lib/pull-request-links/index.ts", mobile).pathname +
						after
					);
				const resolved = id.startsWith("@/")
					? new URL(id.slice(2), mobile).pathname
					: id.startsWith(".")
						? new URL(id, source).pathname
						: id;
				const exports = leaves.get(id) ?? leaves.get(resolved);
				if (!exports) throw Error(`Unowned consumer dependency: ${id}`);
				const path = `${cwd}/leaf-${index++}.ts`;
				writeFileSync(path, "export {};\n");
				mock.module(path, () => exports);
				return before + path + after;
			});
		const path = `${cwd}/consumer.tsx`;
		writeFileSync(path, relocated);
		try {
			return await import(path);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	};
	return {
		React,
		state,
		nativeUrl,
		nativeRow,
		githubRow,
		client,
		render,
		settle,
		cleanup,
		mockLeaf,
		mockHistoryRows,
		setupScreen,
		loadConsumer,
		mobile,
	};
}
