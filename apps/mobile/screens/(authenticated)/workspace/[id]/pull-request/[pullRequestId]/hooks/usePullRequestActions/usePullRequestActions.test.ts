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
	const _ghDetail = {
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
	const { usePullRequestActions } = await import("./usePullRequestActions");
	let action!: ReturnType<typeof usePullRequestActions>;
	function Probe() {
		action = usePullRequestActions(input);
		return null;
	}
	for (const name of ["mark-ready", "update-branch", "reopen"] as const)
		test(`native ${name} carries complete identity`, async () => {
			await f.render(Probe);
			action.run(name);
			await f.settle();
			expect(requests[0]).toEqual({
				method: name,
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
				},
			});
			expect(completed).toBe(1);
		});
	test("native dequeue cannot dispatch", async () => {
		await f.render(Probe);
		action.run("dequeue");
		await f.settle();
		expect(requests).toEqual([]);
	});
	test("old native action callback cannot use new organization", async () => {
		await f.render(Probe);
		const old = action.run;
		f.state.host = { ...f.state.host, organizationId: "other-org" };
		await f.render(Probe);
		old("reopen");
		await f.settle();
		expect(requests).toEqual([]);
	});
	test("native action capability false refuses", async () => {
		input = {
			...base,
			gitlab: {
				...nativeContext,
				detail: {
					...nativeDetail,
					capabilities: { ...nativeDetail.capabilities, reopen: false },
				},
			},
		};
		await f.render(Probe);
		action.run("reopen");
		await f.settle();
		expect(requests).toEqual([]);
	});
	test("native same-frame taps remain one request", async () => {
		deferred = new Promise(() => {});
		await f.render(Probe);
		action.run("reopen");
		action.run("reopen");
		await f.settle();
		expect(requests).toHaveLength(1);
	});
	test("native target changed during await cannot invoke old onDone", async () => {
		let resolve!: (value: unknown) => void;
		deferred = new Promise((r) => (resolve = r));
		await f.render(Probe);
		action.run("reopen");
		await f.settle();
		f.state.workspace = { ...f.state.workspace, projectId: "other" };
		await f.render(Probe);
		await f.React.act(async () => resolve(undefined));
		await f.settle();
		expect(completed).toBe(0);
		expect(messages).toEqual([]);
	});
	test("native rejection after target changes cannot alert the new MR", async () => {
		let reject!: (error: Error) => void;
		deferred = new Promise((_resolve, r) => {
			reject = r;
		});
		await f.render(Probe);
		action.run("reopen");
		await f.settle();
		f.state.workspace = { ...f.state.workspace, projectId: "other" };
		await f.render(Probe);
		await f.React.act(async () => reject(Error("Old target refusal")));
		await f.settle();
		expect(messages).toEqual([]);
		expect(completed).toBe(0);
	});
	test("GH default action keys remain exact", async () => {
		input = { ...base, owner: "Owner", gitlab: undefined };
		await f.render(Probe);
		action.run("dequeue");
		await f.settle();
		expect(requests[0]?.input).toEqual({
			owner: "Owner",
			repo: "Repo",
			pullNumber: 17,
		});
		expect(completed).toBe(1);
	});
	test("native owner unmount revokes pending completion", async () => {
		let resolve!: (value: unknown) => void;
		deferred = new Promise((r) => (resolve = r));
		await f.render(Probe);
		action.run("reopen");
		await f.settle();
		await f.cleanup();
		await f.React.act(async () => resolve(undefined));
		await f.settle();
		expect(completed).toBe(0);
	});

	test("GH owner unmount retains original completion behavior", async () => {
		input = { ...base, owner: "Owner", gitlab: undefined };
		let resolve!: (value: unknown) => void;
		deferred = new Promise((r) => (resolve = r));
		await f.render(Probe);
		action.run("reopen");
		await f.settle();
		await f.cleanup();
		await f.React.act(async () => resolve(undefined));
		await f.settle();
		expect(completed).toBe(1);
	});
	test("retained native plain callback stays silent after unmount", async () => {
		await f.render(Probe);
		const retained = action.run;
		await f.cleanup();
		const count = messages.length;
		retained("reopen");
		await f.settle();
		expect(messages).toHaveLength(count);
		expect(requests).toEqual([]);
		expect(completed).toBe(0);
	});
}
