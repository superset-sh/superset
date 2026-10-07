import { afterEach, expect, test } from "bun:test";
import {
	mobileM2Fixture,
	runMobileM2Child,
} from "../../../../../../hooks/useOpenLink/testFixture.test";

if (process.env.TEST_MOBILE_M2 !== "1") {
	test(
		"actual native primary screen and sheets in owned child",
		() => runMobileM2Child(import.meta.path),
		30000,
	);
} else {
	const f = await mobileM2Fixture();
	f.client.setDefaultOptions({ queries: { retryDelay: 0 } });
	let resolving = false;
	f.mockLeaf("@/hooks/useWorkspaceHost", {
		useWorkspaceHost: () => ({
			host: f.state.host,
			workspace: f.state.workspace,
			isResolving: resolving,
			sandboxWaking: false,
			sandboxUnreachable: false,
		}),
	});
	const React = f.React;
	const View = ({ children }: { children?: React.ReactNode }) =>
		React.createElement("div", null, children);
	const source = new URL("./PullRequestScreen.tsx", import.meta.url);
	const native = {
		provider: "gitlab",
		host: "git.example:8443",
		pullRequest: {
			id: "gitlab:17",
			number: 17,
			title: "Native title",
			body: "Native description",
			url: f.nativeUrl,
			baseBranch: "main",
			state: "open",
			isDraft: false,
			additions: 7,
			deletions: 2,
			changedFiles: 1,
			diffStatsComplete: true,
			mergedAt: null,
			mergedBy: null,
		},
		checks: [
			{
				name: "CI",
				status: "COMPLETED",
				conclusion: "SUCCESS",
				isRequired: false,
				startedAt: null,
				completedAt: null,
				detailsUrl: "https://git.example:8443/Group/Sub/Repo/-/jobs/9",
			},
		],
		reviewers: [
			{ login: "reviewer", avatarUrl: null, isTeam: false, state: "REQUESTED" },
		],
		mergeability: {
			mergeable: "MERGEABLE",
			mergeStateStatus: "CLEAN",
			approvals: 0,
			requiredApprovals: 0,
			reviewDecision: null,
			unresolvedThreads: 0,
			requiresThreadResolution: false,
			queue: null,
			allowedMergeMethods: ["merge"],
		},
		capabilities: {
			merge: true,
			markReady: true,
			updateBranch: true,
			reopen: true,
			dequeue: false,
		},
		reviewState: {
			provider: "gitlab",
			state: "opened",
			detailedMergeStatus: "mergeable",
			approvalsRequired: 0,
			approvalsLeft: 0,
			approvedBy: [],
			blockingDiscussionsResolved: true,
			hasConflicts: false,
		},
		mergePolicy: { provider: "gitlab", method: "merge", squash: "never" },
	};
	let params: Record<string, string> = {
		id: "workspace",
		pullRequestId: "17",
		provider: "gitlab",
		owner: "Group/Sub",
		repo: "Repo",
		expectedUrl: f.nativeUrl,
	};
	let reply: unknown = native;
	let nativeCard: Record<string, unknown> | null = null;
	let ghCard: Record<string, unknown> | null = null;
	let header: Record<string, unknown> | null = null;
	let checks: Record<string, unknown> | null = null;
	let reviewers: Record<string, unknown> | null = null;
	let checkDetail: Record<string, unknown> | null = null;
	const external: string[] = [];
	const linkAlerts: string[] = [];
	let failExternal = false;
	const pressProps: Record<string, unknown>[] = [];
	const mutations: unknown[] = [];
	const confirmations: { onPress?: () => void }[][] = [];
	const i18n = { _: ({ message }: { message: string }) => message };
	f.mockLeaf("@lingui/react/macro", {
		useLingui: () => ({
			i18n,
			t: ({ message }: { message: string }) => message,
		}),
		Trans: View,
		Plural: () => null,
	});
	f.mockLeaf("@superset/i18n", { i18n });
	f.mockLeaf("@superset/i18n/react", {
		useFormat: () => ({
			formatNumber: (n: number) => String(n),
			formatDateTime: (date: Date) => date.toISOString(),
		}),
	});
	const router = {
		push: (input: unknown) => f.state.pushes.push(input),
		replace: () => {},
		back: () => {},
		canGoBack: () => true,
		dismissTo: () => {},
	};
	const Stack = Object.assign(View, {
		Screen: () => null,
		Toolbar: Object.assign(View, {
			Button: () => null,
			Menu: View,
			MenuAction: View,
		}),
	});
	f.mockLeaf("expo-router", {
		router,
		Stack,
		useRouter: () => router,
		useLocalSearchParams: () => params,
	});
	f.mockLeaf("react-native", {
		View,
		ScrollView: View,
		Pressable: (props: Record<string, unknown>) => {
			if (typeof props.onPress === "function") {
				f.state.presses.push(props.onPress as () => void);
				pressProps.push(props);
			}
			return React.createElement(View, props);
		},
		ActivityIndicator: () =>
			React.createElement(View, null, "Owned loading spinner"),
		RefreshControl: () => null,
		Linking: {
			openURL: async (url: string) => {
				if (failExternal) throw Error("Owned OS link rejection");
				external.push(url);
			},
		},
		Share: { share: () => {} },
		Alert: {
			alert: (
				_title: string,
				_body: string,
				buttons: { onPress?: () => void }[],
			) => {
				if (buttons) confirmations.push(buttons);
				else linkAlerts.push(_title);
			},
		},
	});
	f.mockLeaf("lucide-react-native", {
		ChevronRight: () => null,
		ArrowUpRight: () => null,
	});
	f.mockLeaf("expo-clipboard", { setStringAsync: async () => {} });
	f.mockLeaf("expo-haptics", {
		notificationAsync: () => {},
		NotificationFeedbackType: { Success: "success" },
	});
	f.mockLeaf("@/lib/errors", { errorCopy: (e: Error) => e.message });
	f.mockLeaf("@/lib/utils", { cn: (...values: unknown[]) => values.join(" ") });
	f.mockLeaf("@/lib/posthog", { posthog: { capture: () => {} } });
	f.mockLeaf("@/hooks/useReadableInset", { useReadableInset: () => 0 });
	f.mockLeaf("@/screens/(authenticated)/components/ToolbarAnchor", {
		ToolbarAnchor: () => null,
		anchorOf: () => undefined,
	});
	f.mockLeaf("@/screens/(authenticated)/components/HeaderNotice", {
		HeaderNotice: () => null,
	});
	f.mockLeaf("@/hooks/useHostProjects", {
		useHostProjects: () => ({
			projects: [
				{
					id: "project",
					repoOwner: "Group/Sub",
					repoName: "Repo",
					repoUrl: "https://git.example:8443/Group/Sub/Repo.git",
				},
			],
			isReady: true,
		}),
	});
	const client = (url: string) => ({
		github: {
			getPullRequestDetail: {
				query: async (input: unknown) => {
					f.state.requests.push({ url, method: "detail", input });
					if (reply instanceof Error) throw reply;
					return reply;
				},
			},
			mergePR: {
				mutate: async (input: unknown) => {
					mutations.push(input);
					return { merged: true };
				},
			},
			markPullRequestReady: { mutate: async () => {} },
			updatePullRequestBranch: {
				mutate: async (input: unknown) => {
					mutations.push(input);
				},
			},
			reopenPullRequest: { mutate: async () => {} },
		},
		agents: {
			run: {
				mutate: async (input: unknown) => {
					mutations.push(input);
					return { kind: "terminal", sessionId: "session", label: "Agent" };
				},
			},
		},
	});
	f.mockLeaf("@/lib/host-service/client", {
		getHostServiceClientByUrl: client,
		hostServiceUrl: (org: string, machine: string) =>
			`https://broker.example/${org}/${machine}`,
	});
	f.mockLeaf(
		"@/screens/(authenticated)/(home)/home/components/NewChatWidget/stores/newSessionPreferencesStore",
		{
			useNewSessionPreferencesStore: (
				select: (s: { agentId: string }) => string,
			) => select({ agentId: "claude" }),
		},
	);
	f.mockLeaf("@/screens/(authenticated)/(home)/home/hooks/useHostTerminals", {
		getHostTerminalsQueryKey: () => ["terminals"],
	});
	f.mockLeaf("@/screens/(authenticated)/hooks/useAgentLaunchPreferences", {
		agentLaunchPresetId: () => "claude",
		useAgentLaunchPreferences: () => ({}),
	});
	f.mockLeaf("@/screens/(authenticated)/hooks/useHostAgentConfigs", {
		useHostAgentConfigs: () => ({ data: [] }),
	});
	const repo = await import("../../hooks/useWorkspaceRepo/useWorkspaceRepo");
	const detail = await import(
		"../../hooks/useWorkspacePullRequestDetail/useWorkspacePullRequestDetail"
	);
	f.mockLeaf(
		"../../hooks/useWorkspaceRepo",
		repo,
		new URL("./usePullRequestRoute.ts", import.meta.url),
	);
	f.mockLeaf(
		"../../hooks/useWorkspacePullRequestDetail",
		detail,
		new URL("./usePullRequestRoute.ts", import.meta.url),
	);
	f.mockLeaf(
		"@superset/shared/git-remote",
		await import("@superset/shared/git-remote"),
	);
	const route = await f.loadConsumer(
		new URL("./usePullRequestRoute.ts", import.meta.url),
	);
	f.mockLeaf("./usePullRequestRoute", route, source);
	for (const name of [
		"useMergePullRequest",
		"usePullRequestActions",
		"useAskAgent",
	]) {
		const module = await import(`./hooks/${name}/${name}.ts`);
		f.mockLeaf(`./hooks/${name}`, module, source);
	}
	f.mockLeaf(
		"./utils/pullRequestState",
		await import("./utils/pullRequestState/pullRequestState"),
		source,
	);
	f.mockLeaf(
		"./components/PullRequestCard",
		{
			PullRequestCard: (props: Record<string, unknown>) => {
				ghCard = props;
				return null;
			},
		},
		source,
	);
	f.mockLeaf(
		"./components/PullRequestHeader",
		{
			PullRequestHeader: (props: Record<string, unknown>) => {
				header = props;
				return null;
			},
		},
		source,
	);
	f.mockLeaf(
		"./components/PullRequestDescription",
		{
			PullRequestDescription: ({ body }: { body: string }) =>
				React.createElement(View, null, body),
		},
		source,
	);
	f.mockLeaf(
		"./components/GitLabPullRequestCard",
		{
			GitLabPullRequestCard: (props: Record<string, unknown>) => {
				nativeCard = props;
				return React.createElement(View, null, "Owned native card");
			},
		},
		source,
	);
	f.mockLeaf(
		"./utils/gitlabDetailView/gitlabDetailView",
		await import("./utils/gitlabDetailView/gitlabDetailView"),
		source,
	);
	const retryHook = await import(
		"./hooks/useGitlabDetailRetry/useGitlabDetailRetry"
	);
	const status = await f.loadConsumer(
		new URL(
			"./components/GitLabDetailStatus/GitLabDetailStatus.tsx",
			import.meta.url,
		),
	);
	f.mockLeaf("./hooks/useGitlabDetailRetry", retryHook, source);
	f.mockLeaf("./components/GitLabDetailStatus", status, source);
	const screen = await f.loadConsumer(source);
	const setupNested = async (
		name: string,
		relative: string,
		leaf: string,
		exports: Record<string, unknown>,
	) => {
		const path = new URL(relative, import.meta.url);
		f.mockLeaf("../hooks/useGitlabDetailRetry", retryHook, path);
		f.mockLeaf("../components/GitLabDetailStatus", status, path);
		f.mockLeaf("../usePullRequestRoute", route, path);
		f.mockLeaf(leaf, exports, path);
		f.mockLeaf(
			"../utils/gitlabDetailView/gitlabDetailView",
			await import("./utils/gitlabDetailView/gitlabDetailView"),
			path,
		);
		return (await f.loadConsumer(path))[name];
	};
	const Checks = await setupNested(
		"PullRequestChecksScreen",
		"./checks/PullRequestChecksScreen.tsx",
		"../components/ChecksSheet",
		{
			ChecksSheet: (props: Record<string, unknown>) => {
				checks = props;
				return null;
			},
		},
	);
	const Reviewers = await setupNested(
		"PullRequestReviewersScreen",
		"./reviewers/PullRequestReviewersScreen.tsx",
		"../components/ReviewersSheet",
		{
			ReviewersSheet: (props: Record<string, unknown>) => {
				reviewers = props;
				return null;
			},
		},
	);
	f.mockLeaf(
		"@/lib/open-url",
		await f.loadConsumer(new URL("lib/open-url.ts", f.mobile)),
	);
	const Check = await setupNested(
		"PullRequestCheckScreen",
		"./check/PullRequestCheckScreen.tsx",
		"../components/CheckDetailSheet",
		{
			CheckDetailSheet: (props: Record<string, unknown>) => {
				checkDetail = props;
				return null;
			},
		},
	);
	const actionSource = new URL(
		"./components/PullRequestCard/components/ActionButton/ActionButton.tsx",
		import.meta.url,
	);
	f.mockLeaf(
		"../../../../utils/pullRequestState",
		await import("./utils/pullRequestState/pullRequestState"),
		actionSource,
	);
	const actualAction = await f.loadConsumer(actionSource);
	const cardSource = new URL(
		"./components/GitLabPullRequestCard/GitLabPullRequestCard.tsx",
		import.meta.url,
	);
	f.mockLeaf(
		"../PullRequestCard/components/ActionButton",
		actualAction,
		cardSource,
	);
	f.mockLeaf(
		"../../utils/pullRequestState/gitlabState",
		await import("./utils/pullRequestState/gitlabState"),
		cardSource,
	);
	const actualCard = await f.loadConsumer(cardSource);
	const headerSource = new URL(
		"./components/PullRequestHeader/PullRequestHeader.tsx",
		import.meta.url,
	);
	f.mockLeaf(
		"../../../../utils/pullRequest",
		{
			PULL_REQUEST_STATUS: {
				open: { label: { message: "Open" }, surface: "", ink: "" },
			},
			pullRequestStatus: () => "open",
		},
		headerSource,
	);
	const actualHeader = await f.loadConsumer(headerSource);
	const detailSource = new URL(
		"./components/CheckDetailSheet/CheckDetailSheet.tsx",
		import.meta.url,
	);
	f.mockLeaf(
		"../../../../utils/pullRequest",
		await import("../../utils/pullRequest/checks"),
		detailSource,
	);
	f.mockLeaf(
		"../../utils/checkDuration",
		await import("./utils/checkDuration/checkDuration"),
		detailSource,
	);
	f.mockLeaf(
		"./components/Row",
		{
			Row: ({ label, value }: { label: string; value: string }) =>
				React.createElement(View, null, `${label}: ${value}`),
		},
		detailSource,
	);
	const actualCheck = await f.loadConsumer(detailSource);
	const { gitlabDetailView } = await import(
		"./utils/gitlabDetailView/gitlabDetailView"
	);
	const viewOf = (value: typeof native) => {
		const view = gitlabDetailView(value);
		if (!view) throw Error("valid native view required");
		return view;
	};
	afterEach(async () => {
		await f.cleanup();
		params = {
			id: "workspace",
			pullRequestId: "17",
			provider: "gitlab",
			owner: "Group/Sub",
			repo: "Repo",
			expectedUrl: f.nativeUrl,
		};
		reply = native;
		resolving = false;
		f.state.workspace = {
			id: "workspace",
			projectId: "project",
			worktreePath: "/repo",
		};
		nativeCard = null;
		ghCard = null;
		header = null;
		checks = null;
		reviewers = null;
		checkDetail = null;
		external.length = 0;
		linkAlerts.length = 0;
		failExternal = false;
		mutations.length = 0;
		confirmations.length = 0;
		pressProps.length = 0;
	});
	test("real native route/detail query reaches native card and description", async () => {
		await f.render(screen.PullRequestScreen);
		expect(f.state.requests[0]?.input).toEqual({
			owner: "Group/Sub",
			repo: "Repo",
			pullNumber: 17,
			provider: "gitlab",
			host: "git.example:8443",
			workspaceId: "workspace",
			projectId: "project",
			expectedUrl: f.nativeUrl,
		});
		expect(nativeCard).not.toBeNull();
		expect(ghCard).toBeNull();
		expect(document.body.textContent).toContain("Native description");
	});
	test("native card nested check/reviewer callbacks preserve full authority", async () => {
		await f.render(screen.PullRequestScreen);
		const open = nativeCard?.onOpenChecks;
		if (typeof open !== "function")
			throw Error("native checks callback missing");
		open();
		expect(f.state.pushes.at(-1)).toEqual({
			pathname: "/workspace/[id]/pull-request/[pullRequestId]/checks",
			params: {
				id: "workspace",
				pullRequestId: "17",
				owner: "Group/Sub",
				repo: "Repo",
				provider: "gitlab",
				expectedUrl: f.nativeUrl,
			},
		});
		const review = nativeCard?.onOpenReviewers;
		if (typeof review !== "function")
			throw Error("native reviewer callback missing");
		review();
		expect(f.state.pushes.at(-1)).toMatchObject({
			params: { provider: "gitlab", expectedUrl: f.nativeUrl },
		});
	});
	test("native card direct action carries complete reviewed lease", async () => {
		await f.render(screen.PullRequestScreen);
		const run = nativeCard?.onAction;
		if (typeof run !== "function")
			throw Error("native action callback missing");
		run("merge");
		const confirm = confirmations.at(-1)?.[1]?.onPress;
		if (!confirm) throw Error("native confirmation missing");
		confirm();
		await f.settle();
		expect(mutations[0]).toMatchObject({
			provider: "gitlab",
			host: "git.example:8443",
			workspaceId: "workspace",
			projectId: "project",
			expectedUrl: f.nativeUrl,
			squash: false,
		});
	});
	test("native screen rebase and agent callbacks use actual bound hooks", async () => {
		await f.render(screen.PullRequestScreen);
		const run = nativeCard?.onAction;
		if (typeof run !== "function")
			throw Error("native action callback missing");
		run("update-branch");
		await f.settle();
		expect(mutations[0]).toMatchObject({
			provider: "gitlab",
			host: "git.example:8443",
			workspaceId: "workspace",
			projectId: "project",
			expectedUrl: f.nativeUrl,
		});
		run("ask-fix-checks");
		await f.settle();
		expect(mutations[1]).toMatchObject({
			workspaceId: "workspace",
			expectedPullRequest: {
				provider: "gitlab",
				host: "git.example:8443",
				owner: "Group/Sub",
				repo: "Repo",
				pullNumber: 17,
				projectId: "project",
				expectedUrl: f.nativeUrl,
			},
		});
		expect(mutations[1]).toHaveProperty("prompt");
	});
	test("native incomplete statistics never render known counts", async () => {
		reply = {
			...native,
			pullRequest: { ...native.pullRequest, diffStatsComplete: false },
		};
		await f.render(screen.PullRequestScreen);
		expect(header).toMatchObject({ diffStatsComplete: false });
		expect(document.body.textContent).toContain(
			"Merge request changes are unavailable",
		);
	});
	test("native checks sheet forwards complete identity and preserves null dates", async () => {
		await f.render(Checks);
		const callback = checks?.onOpenCheck;
		if (typeof callback !== "function")
			throw Error("native check callback missing");
		callback(native.checks[0]);
		expect(f.state.pushes.at(-1)).toEqual({
			pathname: "/workspace/[id]/pull-request/[pullRequestId]/check",
			params: {
				id: "workspace",
				pullRequestId: "17",
				owner: "Group/Sub",
				repo: "Repo",
				provider: "gitlab",
				expectedUrl: f.nativeUrl,
				name: "CI",
			},
		});
		expect(checks?.checks).toEqual(native.checks);
	});
	test("native reviewers use actual assigned data", async () => {
		await f.render(Reviewers);
		expect(reviewers?.reviewers).toEqual(native.reviewers);
	});
	test("native job detail opens provider link externally", async () => {
		params = { ...params, name: "CI" };
		await f.render(Check);
		expect(checkDetail).toMatchObject({ provider: "gitlab" });
		const open = checkDetail?.onOpenInGitHub;
		if (typeof open !== "function")
			throw Error("native external callback missing");
		open();
		expect(external).toEqual([native.checks[0].detailsUrl]);
	});
	test("native external job link OS rejection is handled through shared opener", async () => {
		params = { ...params, name: "CI" };
		failExternal = true;
		await f.render(Check);
		const open = checkDetail?.onOpenInGitHub;
		if (typeof open !== "function")
			throw Error("native external callback missing");
		open();
		await f.settle();
		expect(external).toEqual([]);
		expect(linkAlerts).toEqual(["Could not open link"]);
	});
	test("native wrong returned identity refuses card", async () => {
		reply = { ...native, host: "other.example" };
		await f.render(screen.PullRequestScreen);
		expect(nativeCard).toBeNull();
		expect(ghCard).toBeNull();
	});
	test("GH default retains original card and sheet route keys", async () => {
		params = {
			id: "workspace",
			pullRequestId: "17",
			owner: "Group/Sub",
			repo: "Repo",
			provider: "github",
		};
		reply = { ...native, provider: undefined, host: undefined };
		await f.render(screen.PullRequestScreen);
		expect(nativeCard).toBeNull();
		expect(ghCard).not.toBeNull();
		const open = ghCard?.onOpenChecks;
		if (typeof open !== "function") throw Error("GH callback missing");
		open();
		expect(f.state.pushes.at(-1)).toEqual({
			pathname: "/workspace/[id]/pull-request/[pullRequestId]/checks",
			params: { id: "workspace", pullRequestId: "17" },
		});
	});
	test("actual native card keeps unknown approvals visible and removes merge", async () => {
		const value = {
			...native,
			reviewState: {
				...native.reviewState,
				approvalsRequired: null,
				approvalsLeft: null,
				detailedMergeStatus: "unknown_state",
			},
		};
		await f.render(() =>
			React.createElement(actualCard.GitLabPullRequestCard, {
				detail: value,
				view: viewOf(value),
				busyAction: null,
				onAction: () => {},
				onOpenChecks: () => {},
				onOpenCheck: () => {},
				onOpenReviewers: () => {},
			}),
		);
		expect(document.body.textContent).toContain(
			"Approval requirements unavailable",
		);
		expect(pressProps.map((p) => p.accessibilityLabel)).not.toContain("Merge");
		expect(pressProps.map((p) => p.accessibilityLabel)).toContain(
			"Rebase branch",
		);
	});
	test("actual native card action and check buttons dispatch genuine data", async () => {
		const value = {
			...native,
			checks: Array.from({ length: 5 }, (_, index) => ({
				...native.checks[0],
				name: `fail-${index}`,
				conclusion: "FAILURE",
			})),
		};
		const opened: unknown[] = [];
		const actions: unknown[] = [];
		await f.render(() =>
			React.createElement(actualCard.GitLabPullRequestCard, {
				detail: value,
				view: viewOf(value),
				busyAction: null,
				onAction: (action: unknown) => actions.push(action),
				onOpenChecks: () => opened.push("checks"),
				onOpenCheck: (check: unknown) => opened.push(check),
				onOpenReviewers: () => opened.push("reviewers"),
			}),
		);
		expect(document.body.textContent).toContain("Checks failed");
		expect(document.body.textContent).not.toContain("fail-3");
		f.state.presses[1]?.();
		expect(opened[0]).toMatchObject({ name: "fail-0", startedAt: null });
		const action = pressProps.find(
			(p) => p.accessibilityLabel === "Fix Checks with Agent",
		)?.onPress;
		if (typeof action !== "function")
			throw Error("genuine action button missing");
		action();
		expect(actions).toEqual(["ask-fix-checks"]);
		expect(pressProps.map((p) => p.accessibilityLabel)).not.toContain(
			"Dequeue",
		);
	});
	test("actual native card marks all action buttons disabled while busy", async () => {
		await f.render(() =>
			React.createElement(actualCard.GitLabPullRequestCard, {
				detail: native,
				view: viewOf(native),
				busyAction: "merge",
				onAction: () => {},
				onOpenChecks: () => {},
				onOpenCheck: () => {},
				onOpenReviewers: () => {},
			}),
		);
		const buttons = pressProps.filter(
			(p) =>
				p.accessibilityLabel === "Merge" ||
				p.accessibilityLabel === "Rebase branch",
		);
		expect(buttons).toHaveLength(2);
		expect(buttons.every((p) => p.disabled === true)).toBe(true);
	});
	test("actual header hides incomplete counts while retaining default GH counts", async () => {
		await f.render(() =>
			React.createElement(actualHeader.PullRequestHeader, {
				pullRequest: viewOf(native).pullRequest,
				diffStatsComplete: false,
			}),
		);
		expect(document.body.textContent).not.toContain("+7");
		expect(document.body.textContent).not.toContain("−2");
		await f.cleanup();
		await f.render(() =>
			React.createElement(actualHeader.PullRequestHeader, {
				pullRequest: viewOf(native).pullRequest,
			}),
		);
		expect(document.body.textContent).toContain("+7");
		expect(document.body.textContent).toContain("−2");
	});
	test("actual job detail labels provider and keeps missing timestamps unavailable", async () => {
		await f.render(() =>
			React.createElement(actualCheck.CheckDetailSheet, {
				check: viewOf(native).checks[0],
				provider: "gitlab",
				onOpenInGitHub: () => external.push("job"),
			}),
		);
		expect(document.body.textContent).toContain("View in GitLab");
		expect(document.body.textContent).toContain("Started: —");
		expect(document.body.textContent).toContain("Completed: —");
		expect(document.body.textContent).not.toContain("Duration");
		await f.cleanup();
		await f.render(() =>
			React.createElement(actualCheck.CheckDetailSheet, {
				check: viewOf(native).checks[0],
				onOpenInGitHub: () => {},
			}),
		);
		expect(document.body.textContent).toContain("View in GitHub");
	});
	test("actual native Free card exposes merge with unavailable counts and complete confirmation", async () => {
		const value = {
			...native,
			reviewState: {
				...native.reviewState,
				approvalsRequired: null,
				approvalsLeft: null,
			},
		};
		await f.render(() =>
			React.createElement(actualCard.GitLabPullRequestCard, {
				detail: value,
				view: viewOf(value),
				busyAction: null,
				onAction: () => {},
				onOpenChecks: () => {},
				onOpenCheck: () => {},
				onOpenReviewers: () => {},
			}),
		);
		expect(document.body.textContent).toContain(
			"Approval requirements unavailable",
		);
		expect(pressProps.map((p) => p.accessibilityLabel)).toContain("Merge");
		await f.cleanup();
		reply = value;
		await f.render(screen.PullRequestScreen);
		const run = nativeCard?.onAction;
		if (typeof run !== "function") throw Error("native action missing");
		run("merge");
		confirmations.at(-1)?.[1]?.onPress?.();
		await f.settle();
		expect(mutations[0]).toMatchObject({
			provider: "gitlab",
			host: "git.example:8443",
			workspaceId: "workspace",
			projectId: "project",
			expectedUrl: f.nativeUrl,
			squash: false,
		});
	});

	for (const status of [401, 503])
		for (const [label, Consumer] of [
			["checks", Checks],
			["reviewers", Reviewers],
			["check", Check],
			["primary", screen.PullRequestScreen],
		] as const) {
			test(`native ${label} ${status} failure renders explicit retry and retries complete binding`, async () => {
				params = { ...params, name: "CI" };
				reply = new Error(`host ${status}`);
				await f.render(Consumer);
				await f.settle();
				expect(document.body.textContent).toContain(
					"Could not load this merge request",
				);
				const button = pressProps.find(
					(p) => p.accessibilityLabel === "Retry",
				)?.onPress;
				if (typeof button !== "function") throw Error("native retry missing");
				reply = native;
				await React.act(async () => button());
				await f.settle();
				expect(f.state.requests.at(-1)?.input).toEqual({
					owner: "Group/Sub",
					repo: "Repo",
					pullNumber: 17,
					provider: "gitlab",
					host: "git.example:8443",
					workspaceId: "workspace",
					projectId: "project",
					expectedUrl: f.nativeUrl,
				});
			});
		}
	test("native cached failed refetch withholds old sheet rows", async () => {
		await f.render(Checks);
		expect(checks).not.toBeNull();
		checks = null;
		reply = new Error("host 503");
		await React.act(async () => {
			await f.client.invalidateQueries();
		});
		await f.settle();
		checks = null;
		await f.render(Checks);
		expect(checks).toBeNull();
		expect(document.body.textContent).toContain(
			"Could not load this merge request",
		);
	});
	test("native pending and offline resolution remain loading then unavailable", async () => {
		f.state.host = { ...f.state.host, isOnline: false };
		resolving = true;
		await f.render(Checks);
		expect(document.body.textContent).toContain("Loading");
		expect(document.body.textContent).not.toContain("Could not load");
		resolving = false;
		await f.render(Checks);
		expect(document.body.textContent).toContain(
			"Could not load this merge request",
		);
		expect(
			pressProps.find((p) => p.accessibilityLabel === "Retry")?.disabled,
		).toBe(true);
		expect(f.state.requests).toEqual([]);
	});
	test("native unknown job renders unavailable status and retry", async () => {
		params = { ...params, name: "missing" };
		await f.render(Check);
		expect(document.body.textContent).toContain(
			"This GitLab check is no longer available.",
		);
		expect(pressProps.map((p) => p.accessibilityLabel)).toContain("Retry");
	});
	test("native primary retry and stale callbacks cannot retarget another host", async () => {
		reply = new Error("host 503");
		await f.render(screen.PullRequestScreen);
		await f.settle();
		const button = pressProps.find(
			(p) => p.accessibilityLabel === "Retry",
		)?.onPress;
		if (typeof button !== "function")
			throw Error("native primary retry missing");
		const count = f.state.requests.length;
		f.state.host = { ...f.state.host, machineId: "other" };
		await f.render(screen.PullRequestScreen);
		await React.act(async () => button());
		await f.settle();
		expect(f.state.requests.length).toBe(count + 2);
		await f.cleanup();
		const before = f.state.requests.length;
		button();
		await f.settle();
		expect(f.state.requests.length).toBe(before);
	});
	for (const [axis, change] of [
		[
			"organization",
			() => {
				f.state.host = { ...f.state.host, organizationId: "other" };
			},
		],
		[
			"project",
			() => {
				f.state.workspace = { ...f.state.workspace, projectId: "other" };
			},
		],
		[
			"workspace",
			() => {
				params = { ...params, id: "other" };
			},
		],
		[
			"URL",
			() => {
				params = { ...params, expectedUrl: f.nativeUrl.replace("/17", "/18") };
			},
		],
		[
			"coordinates",
			() => {
				params = { ...params, owner: "Other" };
			},
		],
		[
			"IID",
			() => {
				params = { ...params, pullRequestId: "18" };
			},
		],
	] as const) {
		test(`retained native retry refuses changed ${axis}`, async () => {
			reply = new Error("host 503");
			await f.render(screen.PullRequestScreen);
			await f.settle();
			const old = pressProps.find(
				(p) => p.accessibilityLabel === "Retry",
			)?.onPress;
			if (typeof old !== "function") throw Error("native retry missing");
			change();
			await f.render(screen.PullRequestScreen);
			await f.settle();
			const before = f.state.requests.length;
			old();
			await f.settle();
			expect(f.state.requests.length).toBe(before);
		});
	}
	for (const [label, Consumer] of [
		["primary", screen.PullRequestScreen],
		["checks", Checks],
		["reviewers", Reviewers],
		["check", Check],
	] as const) {
		test(`native ${label} genuine pending query renders loading`, async () => {
			reply = new Promise(() => {});
			await f.render(Consumer);
			expect(document.body.textContent).toContain("Loading");
			expect(document.body.textContent).not.toContain("Could not load");
		});
	}
	test("native missing detail refuses blank sheet and offers bound retry", async () => {
		reply = { ...native, pullRequest: { ...native.pullRequest, number: 18 } };
		await f.render(Reviewers);
		await f.settle();
		expect(document.body.textContent).toContain(
			"Could not load this merge request",
		);
		expect(reviewers).toBeNull();
		expect(pressProps.map((p) => p.accessibilityLabel)).toContain("Retry");
	});
	test("actual native Free card does not manufacture missing merge permission", async () => {
		const value = {
			...native,
			reviewState: {
				...native.reviewState,
				approvalsRequired: null,
				approvalsLeft: null,
			},
			capabilities: { ...native.capabilities, merge: false },
		};
		await f.render(() =>
			React.createElement(actualCard.GitLabPullRequestCard, {
				detail: value,
				view: viewOf(value),
				busyAction: null,
				onAction: () => {},
				onOpenChecks: () => {},
				onOpenCheck: () => {},
				onOpenReviewers: () => {},
			}),
		);
		expect(document.body.textContent).toContain(
			"Approval requirements unavailable",
		);
		expect(pressProps.map((p) => p.accessibilityLabel)).not.toContain("Merge");
	});
}
