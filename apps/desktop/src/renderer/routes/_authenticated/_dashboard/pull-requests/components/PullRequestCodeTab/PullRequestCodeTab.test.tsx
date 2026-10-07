import { afterEach, expect, mock, spyOn, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: Isolate actual React and browser globals in an owned child.
import { spawnSync } from "node:child_process";
// biome-ignore lint/style/noRestrictedImports: Own the cleared child's scratch directory.
import { mkdtempSync, rmSync } from "node:fs";
import type { ComponentProps } from "react";
import type { PullRequestCodeTab as CodeTab } from "./PullRequestCodeTab";

if (process.env.SUPERSET_PR_CODE_BINDING_FIXTURE !== "1") {
	test("Code tab binding uses actual React Query callbacks in an isolated child", () => {
		const cwd = mkdtempSync("/tmp/superset-code-binding-");
		try {
			const child = spawnSync(
				process.execPath,
				["--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_PR_CODE_BINDING_FIXTURE: "1",
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
			throw Error("Code binding outbound denied");
		},
		{ preconnect: () => {} },
	);
	// biome-ignore lint/style/noRestrictedImports: Deny sockets before application imports.
	const net = await import("node:net");
	spyOn(net.Socket.prototype, "connect").mockImplementation(() => {
		throw Error("Code binding socket denied");
	});
	const deniedEnvironment = {
		config: () => {
			throw Error("Code binding environment denied");
		},
	};
	mock.module("dotenv", () => deniedEnvironment);
	expect((await import("dotenv")).config).toBe(deniedEnvironment.config);
	const denyNative = () => {
		throw Error("Code binding native denied");
	};
	spyOn(Bun, "spawn").mockImplementation(denyNative);
	spyOn(Bun, "spawnSync").mockImplementation(denyNative);
	globalThis.ResizeObserver = class {
		observe() {}
		disconnect() {}
		unobserve() {}
	};
	const React = await import("react");
	const { QueryClient, QueryClientProvider } = await import(
		"@tanstack/react-query"
	);
	const { createRoot } = await import("react-dom/client");
	const { act } = React;
	const empty = () => null;
	mock.module("@lingui/react/macro", () => ({
		useLingui: () => ({ t: (input: { message: string }) => input.message }),
		Trans: empty,
	}));
	mock.module("renderer/hooks/useActiveOrganizationId", () => ({
		useActiveOrganizationId: () => "org",
	}));
	mock.module("renderer/lib/cloud-trpc", () => ({ cloudTrpcClient: {} }));
	const notices: string[] = [];
	mock.module("@superset/ui/sonner", () => ({
		toast: { success: (s: string) => notices.push(s), error: () => {} },
	}));
	mock.module("@superset/i18n/errors", () => ({
		errorMessage: (e: Error) => e.message,
		rawErrorMessage: (e: Error) => e.message,
	}));
	mock.module("renderer/hooks/host-service/useSendToTerminalAgent", () => ({
		formatAgentPromptWithFileContext: (i: { comment: string }) => i.comment,
	}));
	mock.module("renderer/lib/pierreTree", () => ({
		createPierreTreeStyle: () => ({}),
		formatDiffStats: () => "",
		PIERRE_TREE_UNSAFE_CSS: "",
	}));
	mock.module(
		"renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/DiffPane/hooks/useDiffCodeViewTheme",
		() => ({ useDiffCardCodeViewTheme: () => ({ options: {}, style: {} }) }),
	);
	for (const [path, name] of [
		[
			"renderer/routes/_authenticated/_dashboard/components/WorkItemDetailState",
			"WorkItemDetailState",
		],
		[
			"renderer/screens/main/components/DiffFileCollapseButton",
			"DiffFileCollapseButton",
		],
		[
			"renderer/screens/main/components/DiffFileHeaderName",
			"DiffFileHeaderName",
		],
		["renderer/screens/main/components/DiffViewToolbar", "DiffViewToolbar"],
		["renderer/screens/main/components/ResizablePanel", "ResizablePanel"],
	] as const)
		mock.module(path, () => ({ [name]: empty }));
	let threadProps:
		| ComponentProps<
				typeof import("./components/PullRequestCommentThread").PullRequestCommentThread
		  >
		| undefined;
	let reviewThreads: {
		id: string;
		path: string;
		line: number;
		diffSide: "LEFT" | "RIGHT";
		isResolved: boolean;
		isOutdated: boolean;
		comments: {
			id: string;
			databaseId?: number;
			author: { login: string; avatarUrl: string };
			createdAt: string;
			body: string;
		}[];
	}[] = [];
	mock.module("./components/PullRequestCommentThread", () => ({
		PullRequestCommentThread: (props: NonNullable<typeof threadProps>) => {
			threadProps = props;
			return null;
		},
	}));
	const model = { resetPaths() {}, setGitStatus() {} };
	mock.module("@pierre/trees/react", () => ({
		FileTree: empty,
		useFileTree: () => ({ model }),
	}));
	type Submit = (input: {
		comment: string;
		target:
			| { kind: "existing"; terminalId: string }
			| { kind: "new"; configId: string };
	}) => Promise<void>;
	let submit: Submit | undefined;
	const composerBoundary = {
		PullRequestCommentComposer: (props: { onSubmit: Submit }) => {
			submit = props.onSubmit;
			return null;
		},
	};
	mock.module(
		"./components/PullRequestCommentComposer",
		() => composerBoundary,
	);
	expect(
		Object.is(
			(await import("./components/PullRequestCommentComposer"))
				.PullRequestCommentComposer,
			composerBoundary.PullRequestCommentComposer,
		),
	).toBe(true);
	mock.module("@pierre/diffs/react", () => ({
		CodeView: React.forwardRef(
			(
				_props: {
					renderAnnotation: (a: unknown) => React.ReactNode;
					items: { annotations?: unknown[] }[];
				},
				ref,
			) => {
				React.useImperativeHandle(ref, () => ({ clearSelectedLines() {} }));
				if (reviewThreads.length)
					return React.createElement(
						React.Fragment,
						null,
						..._props.items.flatMap((item) =>
							(item.annotations ?? []).map(_props.renderAnnotation),
						),
					);
				return _props.renderAnnotation({
					metadata: {
						kind: "composer",
						path: "a.ts",
						startLine: 1,
						endLine: 1,
						startSide: "additions",
						endSide: "additions",
					},
				});
			},
		),
	}));
	const patch =
		"diff --git a/a.ts b/a.ts\nindex 7898192..6178079 100644\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-a\n+b\n";
	let linkedReply: Record<string, unknown> = {};
	let linkedPending: Promise<Record<string, unknown>> | undefined;
	let calls: { kind: string; input: unknown }[] = [];
	const client = {
		pullRequests: {
			getDiff: {
				query: async (input: unknown) => {
					calls.push({ kind: "diff", input });
					return { patch };
				},
			},
			getThreads: {
				query: async (input: unknown) => {
					calls.push({ kind: "threads", input });
					return { reviewThreads };
				},
			},
			replyToThread: {
				mutate: async (input: unknown) => {
					calls.push({ kind: "reply", input });
					return { id: 99 };
				},
			},
			setThreadResolution: {
				mutate: async (input: unknown) => {
					calls.push({ kind: "resolve", input });
				},
			},
			getLinkedWorkspace: {
				query: async (input: unknown) => {
					calls.push({ kind: "linked", input });
					return linkedPending ?? linkedReply;
				},
			},
		},
		terminal: {
			send: {
				mutate: async (input: unknown) => {
					calls.push({ kind: "send", input });
				},
			},
		},
		agents: {
			run: {
				mutate: async (input: unknown) => {
					calls.push({ kind: "run", input });
				},
			},
		},
	};
	const clientBoundary = { getHostServiceClientByUrl: () => client };
	mock.module("renderer/lib/host-service-client", () => clientBoundary);
	expect(
		Object.is(
			(await import("renderer/lib/host-service-client"))
				.getHostServiceClientByUrl,
			clientBoundary.getHostServiceClientByUrl,
		),
	).toBe(true);
	mock.module("renderer/stores/workspace-creates/useWorkspaceCreates", () => ({
		useWorkspaceCreates: () => ({
			submit: (input: unknown) => {
				calls.push({ kind: "create", input });
				return { completed: Promise.resolve({ ok: true }) };
			},
		}),
	}));
	const { PullRequestCodeTab } = await import("./PullRequestCodeTab");
	const expected = {
		provider: "gitlab" as const,
		projectId: "project",
		host: "gitlab.com",
		owner: "group/nested",
		repo: "repo",
		pullNumber: 7,
		expectedUrl: "https://gitlab.com/group/nested/repo/-/merge_requests/7",
	};
	const props = {
		projectId: "project",
		prNumber: 7,
		prUrl: expected.expectedUrl,
		hostUrl: "https://owned-host.invalid",
		hostId: "host",
	};
	let root: ReturnType<typeof createRoot> | undefined;
	let queryClient: InstanceType<typeof QueryClient>;
	async function render(input = props) {
		if (!root) {
			root = createRoot(document.createElement("div"));
			queryClient = new QueryClient({
				defaultOptions: {
					queries: { retry: false },
					mutations: { retry: false },
				},
			});
		}
		await act(async () => {
			root?.render(
				React.createElement(
					QueryClientProvider,
					{ client: queryClient },
					React.createElement(
						PullRequestCodeTab,
						input as ComponentProps<typeof CodeTab>,
					),
				),
			);
		});
		await settle();
	}
	async function settle() {
		await act(async () => {
			await new Promise((r) => setTimeout(r, 20));
		});
	}
	async function send(
		target: Parameters<Submit>[0]["target"] = {
			kind: "existing",
			terminalId: "terminal",
		},
	) {
		expect(submit).toBeFunction();
		await act(async () => {
			await submit?.({ comment: "review", target });
		});
	}
	afterEach(async () => {
		await act(async () => root?.unmount());
		root = undefined;
		queryClient?.clear();
		submit = undefined;
		linkedPending = undefined;
		linkedReply = {};
		threadProps = undefined;
		reviewThreads = [];
		calls = [];
		notices.length = 0;
	});
	test("actual GL composer refuses missing old-host acknowledgement", async () => {
		linkedReply = { workspaceId: "workspace" };
		await render();
		await expect(send()).rejects.toThrow();
		expect(calls.filter((c) => c.kind === "send")).toHaveLength(0);
	});
	test("actual GL lookup sends complete binding and terminal send preserves it", async () => {
		linkedReply = { workspaceId: "workspace", validatedPullRequest: expected };
		await render();
		await send();
		expect(calls.find((c) => c.kind === "linked")?.input).toEqual({
			projectId: "project",
			prNumber: 7,
			expectedPullRequest: expected,
		});
		expect(calls.find((c) => c.kind === "send")?.input).toEqual({
			workspaceId: "workspace",
			terminalId: "terminal",
			text: "review",
			submit: true,
			expectedPullRequest: expected,
		});
	});
	test("actual GL new session carries complete acknowledged binding", async () => {
		linkedReply = { workspaceId: "workspace", validatedPullRequest: expected };
		await render();
		await send({ kind: "new", configId: "agent" });
		expect(calls.find((c) => c.kind === "run")?.input).toEqual({
			workspaceId: "workspace",
			agent: "agent",
			prompt: "review",
			expectedPullRequest: expected,
		});
	});
	test("actual GL create carries binding and refuses missing ack before create", async () => {
		linkedReply = { workspaceId: null };
		await render();
		await expect(send({ kind: "new", configId: "agent" })).rejects.toThrow();
		expect(calls.filter((c) => c.kind === "create")).toHaveLength(0);
	});
	test("actual GL callback captured before MR change refuses delivery", async () => {
		linkedReply = { workspaceId: "workspace", validatedPullRequest: expected };
		await render();
		const oldSubmit = submit;
		linkedReply = {
			workspaceId: "other",
			validatedPullRequest: {
				...expected,
				owner: "other",
				expectedUrl: "https://gitlab.com/other/repo/-/merge_requests/7",
			},
		};
		await render({
			...props,
			prUrl: "https://gitlab.com/other/repo/-/merge_requests/7",
		});
		await act(async () => {
			await expect(
				oldSubmit?.({
					comment: "review",
					target: { kind: "existing", terminalId: "terminal" },
				}),
			).rejects.toThrow();
		});
		expect(calls.filter((c) => c.kind === "send")).toHaveLength(0);
	});
	test("actual GH query keys preserve upstream repository context and delivery input", async () => {
		linkedReply = { workspaceId: "workspace" };
		await render({ ...props, prUrl: "https://github.com/group/repo/pull/7" });
		await send();
		expect(calls.find((c) => c.kind === "linked")?.input).toEqual({
			projectId: "project",
			prNumber: 7,
		});
		expect(calls.find((c) => c.kind === "send")?.input).toEqual({
			workspaceId: "workspace",
			terminalId: "terminal",
			text: "review",
			submit: true,
		});
		expect(
			queryClient
				.getQueryCache()
				.getAll()
				.map((q) => q.queryKey),
		).toEqual([
			["pull-request-diff", "org", "group/repo", "project", props.hostUrl, 7],
			["pull-request-threads", "project", props.hostUrl, 7],
			["pull-request-linked-workspace", "project", props.hostUrl, 7],
		]);
	});
	test("actual GL acknowledged create includes identity in checkout snapshot", async () => {
		linkedReply = { workspaceId: null, validatedPullRequest: expected };
		await render();
		await send({ kind: "new", configId: "agent" });
		const create = calls.find((c) => c.kind === "create")?.input;
		expect(create).toMatchObject({
			hostId: "host",
			snapshot: {
				projectId: "project",
				pr: 7,
				expectedPullRequest: expected,
				agents: [{ agent: "agent", prompt: "review" }],
			},
		});
		expect(notices).toEqual(["Sent to agent"]);
	});
	for (const changed of [
		{ host: "other.invalid" },
		{ owner: "Group/nested" },
		{ repo: "other" },
		{ projectId: "other" },
		{ pullNumber: 8 },
		{ expectedUrl: "https://gitlab.com/other/repo/-/merge_requests/7" },
		{ provider: "github" },
	]) {
		test(`actual GL refuses contradictory ack ${Object.keys(changed)[0]}`, async () => {
			linkedReply = {
				workspaceId: "workspace",
				validatedPullRequest: { ...expected, ...changed },
			};
			await render();
			await expect(send()).rejects.toThrow();
			expect(calls.filter((c) => c.kind === "send")).toHaveLength(0);
			expect(notices).toEqual([]);
		});
	}
	test("actual GL host/namespace changes isolate all three query caches", async () => {
		linkedReply = { workspaceId: "workspace", validatedPullRequest: expected };
		await render();
		const before = queryClient
			.getQueryCache()
			.getAll()
			.map((q) => q.queryKey);
		const next = {
			...expected,
			owner: "other",
			host: "custom.invalid:8443",
			expectedUrl: "https://custom.invalid:8443/other/repo/-/merge_requests/7",
		};
		linkedReply = { workspaceId: "next", validatedPullRequest: next };
		await render({ ...props, prUrl: next.expectedUrl });
		expect(calls.filter((c) => c.kind === "linked")).toHaveLength(2);
		expect(calls.filter((c) => c.kind === "diff")).toHaveLength(2);
		expect(calls.filter((c) => c.kind === "threads")).toHaveLength(2);
		expect(queryClient.getQueryCache().getAll()).toHaveLength(6);
		expect(before.map((key) => key.length)).toEqual([7, 5, 5]);
		expect(before.every((key) => typeof key.at(-1) === "string")).toBe(true);
		await send();
		expect(calls.find((c) => c.kind === "send")?.input).toMatchObject({
			workspaceId: "next",
			expectedPullRequest: next,
		});
	});
	test("actual GL malformed raw URL refuses delivery without lookup", async () => {
		linkedReply = { workspaceId: "workspace", validatedPullRequest: expected };
		await render({
			...props,
			prUrl: `${expected.expectedUrl}?token=ambiguous`,
		});
		await expect(send()).rejects.toThrow();
		expect(calls.filter((c) => c.kind === "linked")).toHaveLength(0);
		expect(calls.filter((c) => c.kind === "send")).toHaveLength(0);
	});
	test("actual stable pane identity refuses contradictory current URL", async () => {
		linkedReply = { workspaceId: "workspace", validatedPullRequest: expected };
		const input = {
			...props,
			expectedRef: {
				provider: "gitlab" as const,
				host: "other.invalid",
				repoFullName: "group/nested/repo",
				number: 7,
			},
		};
		await render(input);
		await expect(send()).rejects.toThrow();
		expect(calls.filter((c) => c.kind === "linked")).toHaveLength(0);
		expect(calls.filter((c) => c.kind === "send")).toHaveLength(0);
	});
	test("actual GL retained composer does not deliver while lookup is pending", async () => {
		let complete: ((value: Record<string, unknown>) => void) | undefined;
		linkedPending = new Promise((resolve) => {
			complete = resolve;
		});
		await render();
		await expect(send()).rejects.toThrow();
		expect(calls.filter((c) => c.kind === "send")).toHaveLength(0);
		await act(async () => {
			complete?.({ workspaceId: "workspace", validatedPullRequest: expected });
		});
		await settle();
		await send();
		expect(calls.filter((c) => c.kind === "send")).toHaveLength(1);
	});
	test("actual GL callback cannot become unbound after GH switch", async () => {
		linkedReply = { workspaceId: "workspace", validatedPullRequest: expected };
		await render();
		const retained = submit;
		linkedReply = { workspaceId: "gh-workspace" };
		await render({ ...props, prUrl: "https://github.com/group/repo/pull/7" });
		await act(async () => {
			await expect(
				retained?.({
					comment: "retained GL",
					target: { kind: "existing", terminalId: "terminal" },
				}),
			).rejects.toThrow();
		});
		expect(calls.filter((c) => c.kind === "send")).toHaveLength(0);
	});
	test("actual malformed GL namespace cannot become absent GH binding", async () => {
		linkedReply = { workspaceId: "workspace" };
		await render({
			...props,
			prUrl: "https://gitlab.com/group/%2F/repo/-/merge_requests/7",
		});
		await expect(send()).rejects.toThrow();
		expect(calls.filter((c) => c.kind === "send")).toHaveLength(0);
	});
	const discussionId =
		"gitlab:gitlab.example%3A8443:Group/Sub/repo:7:opaque_discussion-9";
	function selectDiscussion(
		id = discussionId,
		databaseId: number | undefined = 31,
	) {
		reviewThreads = [
			{
				id,
				path: "a.ts",
				line: 1,
				diffSide: "RIGHT",
				isResolved: false,
				isOutdated: false,
				comments: [
					{
						id: "note",
						databaseId,
						author: { login: "reviewer", avatarUrl: "" },
						createdAt: "2026-10-04T00:00:00Z",
						body: "Review",
					},
				],
			},
		];
	}
	const discussionProps = {
		...props,
		prUrl: "https://gitlab.example:8443/Group/Sub/repo/-/merge_requests/7",
	};
	test("actual GL thread reply carries opaque discussion and numeric note", async () => {
		selectDiscussion();
		await render(discussionProps);
		expect(threadProps).toBeDefined();
		expect(threadProps?.provider).toBe("gitlab");
		await act(async () => {
			expect(threadProps?.onReply("A reply")).toBe(true);
		});
		await settle();
		expect(calls.find((call) => call.kind === "reply")?.input).toEqual({
			projectId: "project",
			prNumber: 7,
			commentId: 31,
			threadId: discussionId,
			body: "A reply",
		});
	});
	test("actual GL thread resolution carries project and merge request", async () => {
		selectDiscussion();
		await render(discussionProps);
		await act(async () => {
			threadProps?.onResolveChange(true);
		});
		await settle();
		await act(async () => {
			threadProps?.onResolveChange(false);
		});
		await settle();
		expect(
			calls.filter((call) => call.kind === "resolve").map((call) => call.input),
		).toEqual([
			{
				threadId: discussionId,
				resolved: true,
				projectId: "project",
				prNumber: 7,
			},
			{
				threadId: discussionId,
				resolved: false,
				projectId: "project",
				prNumber: 7,
			},
		]);
	});
	test("actual GH thread mutation inputs keep their original own keys", async () => {
		selectDiscussion("github-thread");
		await render({ ...props, prUrl: "https://github.com/group/repo/pull/7" });
		await act(async () => {
			expect(threadProps?.provider).toBe("github");
			expect(threadProps?.onReply("A reply")).toBe(true);
			threadProps?.onResolveChange(true);
		});
		await settle();
		expect(calls.find((call) => call.kind === "reply")?.input).toEqual({
			projectId: "project",
			prNumber: 7,
			commentId: 31,
			body: "A reply",
		});
		expect(calls.find((call) => call.kind === "resolve")?.input).toEqual({
			threadId: "github-thread",
			resolved: true,
		});
	});
	test("actual GL thread without numeric note preserves reply draft", async () => {
		selectDiscussion();
		delete reviewThreads[0]?.comments[0]?.databaseId;
		await render(discussionProps);
		expect(threadProps?.onReply("Retain this draft")).toBe(false);
		expect(calls.filter((call) => call.kind === "reply")).toEqual([]);
	});
}
