import { afterEach, expect, test } from "bun:test";
import {
	mobileM2Fixture,
	runMobileM2Child,
} from "../../../../../../../../hooks/useOpenLink/testFixture.test";

if (process.env.TEST_MOBILE_M2 !== "1") {
	test(
		"actual bound action in owned child",
		() => runMobileM2Child(import.meta.path),
		30000,
	);
} else {
	const f = await mobileM2Fixture();
	const nativeDetail = {
		provider: "gitlab" as const,
		host: "git.example:8443",
		pullRequest: {
			id: "gitlab:17",
			number: 17,
			title: "Native",
			body: "",
			url: f.nativeUrl,
			baseBranch: "main",
			state: "open" as const,
			isDraft: false,
			additions: 7,
			deletions: 2,
			changedFiles: 1,
			diffStatsComplete: true,
			mergedAt: null,
			mergedBy: null,
		},
		checks: [],
		reviewers: [],
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
			detailedMergeStatus: "mergeable",
			approvalsRequired: null,
			approvalsLeft: null,
			approvedBy: [],
			blockingDiscussionsResolved: true,
			hasConflicts: false,
		},
		mergePolicy: {
			provider: "gitlab" as const,
			method: "merge" as const,
			squash: "never" as const,
		},
	};
	const ghDetail = {
		...nativeDetail,
		provider: undefined,
		pullRequest: {
			...nativeDetail.pullRequest,
			id: "gh",
			url: "https://github.com/Owner/Repo/pull/17",
		},
	};
	const nativeContext = {
		projectId: "project",
		host: "git.example:8443",
		expectedUrl: f.nativeUrl,
		detail: nativeDetail,
	};
	const messages: {
		title: string;
		body: string;
		buttons?: { text: string; onPress?: () => void }[];
	}[] = [];
	const requests: { method: string; url: string; input: unknown }[] = [];
	let completed = 0;
	let deferred: Promise<unknown> | null = null;
	let reply: unknown = { merged: true };
	const i18n = { _: ({ message }: { message: string }) => message };
	f.mockLeaf("@lingui/react/macro", {
		useLingui: () => ({
			i18n,
			t: ({ message }: { message: string }) => message,
		}),
	});
	f.mockLeaf("@superset/i18n", { i18n });
	f.mockLeaf("react-native", {
		Alert: {
			alert: (
				title: string,
				body: string,
				buttons?: (typeof messages)[number]["buttons"],
			) => messages.push({ title, body, buttons }),
		},
	});
	f.mockLeaf("@/lib/errors", { errorCopy: (error: Error) => error.message });
	const mutate = (method: string, url: string) => async (input: unknown) => {
		requests.push({ method, url, input });
		return deferred ?? reply;
	};
	const getHostServiceClientByUrl = (url: string) => ({
		github: {
			mergePR: { mutate: mutate("mergePR", url) },
			markPullRequestReady: { mutate: mutate("mark-ready", url) },
			updatePullRequestBranch: { mutate: mutate("update-branch", url) },
			reopenPullRequest: { mutate: mutate("reopen", url) },
			dequeuePullRequest: { mutate: mutate("dequeue", url) },
		},
		agents: { run: { mutate: mutate("agent", url) } },
	});
	f.mockLeaf("@/lib/host-service/client", {
		hostServiceUrl: (org: string, machine: string) =>
			`https://broker.example/${org}/${machine}`,
		getHostServiceClientByUrl,
	});
	expect(
		Object.is(
			(await import("@/lib/host-service/client")).getHostServiceClientByUrl,
			getHostServiceClientByUrl,
		),
	).toBe(true);
	const base = {
		workspaceId: "workspace",
		owner: "Group/Sub",
		repo: "Repo",
		pullNumber: 17,
		gitlab: nativeContext,
		onMerged: () => completed++,
		onDone: () => completed++,
	};
	let input = { ...base };
	afterEach(async () => {
		await f.cleanup();
		input = { ...base };
		f.state.workspace = {
			id: "workspace",
			projectId: "project",
			worktreePath: "/repo",
		};
		requests.length = 0;
		messages.length = 0;
		completed = 0;
		deferred = null;
		reply = { merged: true };
	});
	const navigation: string[] = [];
	f.mockLeaf("expo-router", {
		useRouter: () => ({ dismissTo: (url: string) => navigation.push(url) }),
	});
	f.mockLeaf(
		"@/screens/(authenticated)/(home)/home/components/NewChatWidget/stores/newSessionPreferencesStore",
		{
			useNewSessionPreferencesStore: (
				select: (state: { agentId: string }) => string,
			) => select({ agentId: "claude" }),
		},
	);
	f.mockLeaf("@/screens/(authenticated)/(home)/home/hooks/useHostTerminals", {
		getHostTerminalsQueryKey: (machine: string) => ["terminals", machine],
	});
	f.mockLeaf("@/screens/(authenticated)/hooks/useAgentLaunchPreferences", {
		agentLaunchPresetId: () => "claude",
		useAgentLaunchPreferences: () => ({
			model: { id: "model" },
			effort: { id: "effort" },
		}),
	});
	f.mockLeaf("@/screens/(authenticated)/hooks/useHostAgentConfigs", {
		useHostAgentConfigs: () => ({ data: [] }),
	});
	const { useAskAgent } = await import("./useAskAgent");
	let action!: ReturnType<typeof useAskAgent>;
	function Probe() {
		action = useAskAgent(input);
		return null;
	}
	afterEach(() => {
		navigation.length = 0;
	});
	test("native agent sends genuine expected tuple and MR prompt", async () => {
		reply = { kind: "terminal", sessionId: "session", label: "Agent" };
		await f.render(Probe);
		action.ask("ask-resolve-conflicts", nativeDetail);
		await f.settle();
		expect(requests[0]?.input).toEqual({
			workspaceId: "workspace",
			agent: "claude",
			prompt: `MR #17 (${f.nativeUrl}) has merge conflicts with main. Resolve them on this branch and push the result.`,
			model: "model",
			effort: "effort",
			expectedPullRequest: {
				provider: "gitlab",
				projectId: "project",
				host: "git.example:8443",
				owner: "Group/Sub",
				repo: "Repo",
				pullNumber: 17,
				expectedUrl: f.nativeUrl,
			},
		});
		expect(navigation).toEqual([
			"/(authenticated)/workspace/workspace?tab=session",
		]);
	});
	for (const bad of [
		false,
		{ kind: "chat", sessionId: "session", label: "Agent" },
		{ kind: "terminal", sessionId: "", label: "Agent" },
		{ kind: "terminal", label: "Agent" },
		{ kind: "terminal", sessionId: "session" },
	])
		test(`native invalid acknowledgement ${JSON.stringify(bad)} refuses navigation`, async () => {
			reply = bad;
			await f.render(Probe);
			action.ask("ask-resolve-conflicts", nativeDetail);
			await f.settle();
			expect(navigation).toEqual([]);
			expect(messages.at(-1)?.title).toBe("Could not start agent");
		});
	test("retained native ask cannot retarget after host switch", async () => {
		await f.render(Probe);
		const old = action.ask;
		f.state.host = { ...f.state.host, machineId: "other" };
		await f.render(Probe);
		old("ask-resolve-conflicts", nativeDetail);
		await f.settle();
		expect(requests).toEqual([]);
	});
	test("native target changes during await cannot navigate old session", async () => {
		let resolve!: (value: unknown) => void;
		deferred = new Promise((r) => (resolve = r));
		await f.render(Probe);
		action.ask("ask-resolve-conflicts", nativeDetail);
		await f.settle();
		f.state.workspace = { ...f.state.workspace, projectId: "other" };
		await f.render(Probe);
		await f.React.act(async () =>
			resolve({ kind: "terminal", sessionId: "session", label: "Agent" }),
		);
		await f.settle();
		expect(navigation).toEqual([]);
	});
	test("native same-frame taps launch one bound request", async () => {
		deferred = new Promise(() => {});
		await f.render(Probe);
		action.ask("ask-resolve-conflicts", nativeDetail);
		action.ask("ask-resolve-conflicts", nativeDetail);
		await f.settle();
		expect(requests).toHaveLength(1);
	});
	test("GH original agent request and prompt remain exact", async () => {
		input = { ...base, owner: "Owner", gitlab: undefined };
		reply = { kind: "terminal", sessionId: "session", label: "Agent" };
		await f.render(Probe);
		action.ask("ask-resolve-conflicts", ghDetail);
		await f.settle();
		expect(requests[0]?.input).toEqual({
			workspaceId: "workspace",
			agent: "claude",
			prompt:
				"PR #17 (https://github.com/Owner/Repo/pull/17) has merge conflicts with main. Resolve them on this branch and push the result.",
			model: "model",
			effort: "effort",
		});
		expect(navigation).toEqual([
			"/(authenticated)/workspace/workspace?tab=session",
		]);
	});
	test("partial native agent context refuses before dispatch", async () => {
		input = { ...base, gitlab: { ...nativeContext, expectedUrl: "" } };
		await f.render(Probe);
		action.ask("ask-resolve-conflicts", nativeDetail);
		expect(requests).toEqual([]);
		expect(navigation).toEqual([]);
	});
	test("native agent detail mismatch cannot send", async () => {
		reply = { kind: "terminal", sessionId: "session", label: "Agent" };
		await f.render(Probe);
		action.ask("ask-resolve-conflicts", {
			...nativeDetail,
			pullRequest: {
				...nativeDetail.pullRequest,
				url: f.nativeUrl.replace("17", "18"),
			},
		});
		expect(requests).toEqual([]);
	});
	test("native owner unmount revokes pending completion", async () => {
		let resolve!: (value: unknown) => void;
		deferred = new Promise((r) => (resolve = r));
		await f.render(Probe);
		action.ask("ask-resolve-conflicts", nativeDetail);
		await f.settle();
		await f.cleanup();
		await f.React.act(async () =>
			resolve({ kind: "terminal", sessionId: "session", label: "Agent" }),
		);
		await f.settle();
		expect(navigation).toEqual([]);
	});

	test("GH owner unmount retains original completion behavior", async () => {
		input = { ...base, owner: "Owner", gitlab: undefined };
		let resolve!: (value: unknown) => void;
		deferred = new Promise((r) => (resolve = r));
		await f.render(Probe);
		action.ask("ask-resolve-conflicts", ghDetail);
		await f.settle();
		await f.cleanup();
		await f.React.act(async () =>
			resolve({ kind: "terminal", sessionId: "session", label: "Agent" }),
		);
		await f.settle();
		expect(navigation).toEqual([
			"/(authenticated)/workspace/workspace?tab=session",
		]);
	});
	test("retained native agent callback stays silent after unmount", async () => {
		await f.render(Probe);
		const retained = action.ask;
		await f.cleanup();
		const count = messages.length;
		retained("ask-resolve-conflicts", nativeDetail);
		await f.settle();
		expect(messages).toHaveLength(count);
		expect(requests).toEqual([]);
		expect(navigation).toEqual([]);
	});
}
