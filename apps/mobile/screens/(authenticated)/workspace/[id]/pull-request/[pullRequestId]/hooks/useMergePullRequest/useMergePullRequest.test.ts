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
	const { useMergePullRequest } = await import("./useMergePullRequest");
	let action!: ReturnType<typeof useMergePullRequest>;
	function Probe() {
		action = useMergePullRequest(input);
		return null;
	}
	function confirm(index = 1) {
		const callback = messages.at(-1)?.buttons?.[index]?.onPress;
		if (!callback) throw Error("confirmation callback missing");
		callback();
	}
	test("native merge sends complete bound input and acknowledges actual merge", async () => {
		await f.render(Probe);
		action.confirmAndMerge(nativeDetail);
		confirm();
		await f.settle();
		expect(requests[0]).toEqual({
			method: "mergePR",
			url: "https://broker.example/org/cloud:workspace",
			input: {
				owner: "Group/Sub",
				repo: "Repo",
				pullNumber: 17,
				provider: "gitlab",
				host: "git.example:8443",
				projectId: "project",
				workspaceId: "workspace",
				expectedUrl: f.nativeUrl,
				mergeMethod: "merge",
				squash: false,
			},
		});
		expect(completed).toBe(1);
	});
	test("retained native confirmation cannot retarget to another project", async () => {
		await f.render(Probe);
		action.confirmAndMerge(nativeDetail);
		const old = messages.at(-1)?.buttons?.[1]?.onPress;
		f.state.workspace = { ...f.state.workspace, projectId: "other" };
		await f.render(Probe);
		old?.();
		await f.settle();
		expect(requests).toEqual([]);
		expect(completed).toBe(0);
	});
	test("native fast-forward forced squash preserves policy and rebase path", async () => {
		const detail = {
			...nativeDetail,
			mergePolicy: {
				provider: "gitlab" as const,
				method: "ff" as const,
				squash: "always" as const,
			},
		};
		input = { ...base, gitlab: { ...nativeContext, detail } };
		await f.render(Probe);
		action.confirmAndMerge(detail);
		expect(messages[0]?.title).toContain("Fast-forward");
		confirm();
		await f.settle();
		expect(requests[0]?.input).toMatchObject({
			mergeMethod: "rebase",
			squash: true,
		});
	});
	test("optional native squash offers both explicit choices", async () => {
		const detail = {
			...nativeDetail,
			mergePolicy: {
				provider: "gitlab" as const,
				method: "rebase_merge" as const,
				squash: "default_on" as const,
			},
		};
		input = { ...base, gitlab: { ...nativeContext, detail } };
		await f.render(Probe);
		action.confirmAndMerge(detail);
		expect(messages[0]?.buttons).toHaveLength(3);
		confirm(2);
		await f.settle();
		expect(requests[0]?.input).toMatchObject({
			mergeMethod: "rebase",
			squash: false,
		});
	});
	test("false provider merge result refuses completion", async () => {
		reply = { merged: false };
		await f.render(Probe);
		action.confirmAndMerge(nativeDetail);
		confirm();
		await f.settle();
		expect(completed).toBe(0);
		expect(messages.at(-1)?.title).toBe("GitLab refused the merge");
	});
	test("native target change during await suppresses old completion", async () => {
		let resolve!: (value: unknown) => void;
		deferred = new Promise((r) => (resolve = r));
		await f.render(Probe);
		action.confirmAndMerge(nativeDetail);
		confirm();
		await f.settle();
		f.state.host = { ...f.state.host, machineId: "other" };
		await f.render(Probe);
		await f.React.act(async () => resolve({ merged: true }));
		await f.settle();
		expect(completed).toBe(0);
	});
	test("GH default retains exact request and label", async () => {
		input = { ...base, owner: "Owner", gitlab: undefined };
		await f.render(Probe);
		action.confirmAndMerge(ghDetail);
		expect(messages[0]?.title).toBe("Merge Commit");
		confirm();
		await f.settle();
		expect(requests[0]?.input).toEqual({
			owner: "Owner",
			repo: "Repo",
			pullNumber: 17,
			mergeMethod: "merge",
		});
		expect(completed).toBe(1);
	});
	test("partial native context cannot fall back to GH", async () => {
		input = { ...base, gitlab: { ...nativeContext, expectedUrl: "" } };
		await f.render(Probe);
		action.confirmAndMerge(nativeDetail);
		expect(requests).toEqual([]);
		expect(messages.at(-1)?.title).toBe("GitLab refused the merge");
	});
	test("native detail argument mismatch cannot dispatch", async () => {
		await f.render(Probe);
		action.confirmAndMerge({
			...nativeDetail,
			pullRequest: { ...nativeDetail.pullRequest, number: 18 },
		});
		expect(requests).toEqual([]);
	});
	test("retained confirmation refuses changed native merge policy", async () => {
		await f.render(Probe);
		action.confirmAndMerge(nativeDetail);
		const old = messages.at(-1)?.buttons?.[1]?.onPress;
		input = {
			...base,
			gitlab: {
				...nativeContext,
				detail: {
					...nativeDetail,
					mergePolicy: {
						provider: "gitlab",
						method: "merge",
						squash: "always",
					},
				},
			},
		};
		await f.render(Probe);
		old?.();
		await f.settle();
		expect(requests).toEqual([]);
	});
	test("native same-frame confirmation callbacks issue one request", async () => {
		deferred = new Promise(() => {});
		await f.render(Probe);
		action.confirmAndMerge(nativeDetail);
		const old = messages.at(-1)?.buttons?.[1]?.onPress;
		old?.();
		old?.();
		await f.settle();
		expect(requests).toHaveLength(1);
	});
	test("native owner unmount revokes pending completion", async () => {
		let resolve!: (value: unknown) => void;
		deferred = new Promise((r) => (resolve = r));
		await f.render(Probe);
		action.confirmAndMerge(nativeDetail);
		confirm();
		await f.settle();
		await f.cleanup();
		await f.React.act(async () => resolve({ merged: true }));
		await f.settle();
		expect(completed).toBe(0);
	});

	test("GH owner unmount retains original completion behavior", async () => {
		input = { ...base, owner: "Owner", gitlab: undefined };
		let resolve!: (value: unknown) => void;
		deferred = new Promise((r) => (resolve = r));
		await f.render(Probe);
		action.confirmAndMerge(ghDetail);
		confirm();
		await f.settle();
		await f.cleanup();
		await f.React.act(async () => resolve({ merged: true }));
		await f.settle();
		expect(completed).toBe(1);
	});
	test("retained native merge callbacks stay silent after unmount", async () => {
		await f.render(Probe);
		const retained = action.confirmAndMerge;
		retained(nativeDetail);
		const old = messages.at(-1)?.buttons?.[1]?.onPress;
		await f.cleanup();
		const count = messages.length;
		old?.();
		retained(nativeDetail);
		await f.settle();
		expect(messages).toHaveLength(count);
		expect(requests).toEqual([]);
		expect(completed).toBe(0);
	});
}
