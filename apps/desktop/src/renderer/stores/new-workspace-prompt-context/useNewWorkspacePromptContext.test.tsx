import { afterEach, expect, mock, spyOn, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: Own the cleared test child's scratch directory.
import { mkdtempSync, rmSync } from "node:fs";
import type { NewWorkspacePromptContextApi } from "./useNewWorkspacePromptContext";

if (process.env.SUPERSET_ISSUE_HOOK_FIXTURE !== "1") {
	test("native issue prompt pipeline runs with genuine React and Zustand", () => {
		const cwd = mkdtempSync("/tmp/superset-issue-prompt-");
		try {
			const child = Bun.spawnSync(
				[process.execPath, "--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_ISSUE_HOOK_FIXTURE: "1",
						...(process.env.SUPERSET_ISSUE_HOOK_BASELINE_FILE
							? {
									SUPERSET_ISSUE_HOOK_BASELINE_FILE:
										process.env.SUPERSET_ISSUE_HOOK_BASELINE_FILE,
								}
							: {}),
					},
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
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	globalThis.fetch = Object.assign(
		async () => {
			throw Error("Outbound denied");
		},
		{ preconnect: () => {} },
	);
	// biome-ignore lint/style/noRestrictedImports: Reject sockets before application imports.
	const net = await import("node:net");
	spyOn(net.Socket.prototype, "connect").mockImplementation(() => {
		throw Error("Socket denied");
	});
	spyOn(Bun, "spawn").mockImplementation(() => {
		throw Error("Native denied");
	});
	spyOn(Bun, "spawnSync").mockImplementation(() => {
		throw Error("Native denied");
	});
	const dotenvName = "dotenv";
	mock.module(dotenvName, () => ({
		config: () => {
			throw Error("Environment denied");
		},
	}));
	mock.module("@lingui/core/macro", () => ({
		msg: (input: { message: string }) => input,
	}));
	mock.module("@superset/i18n", () => ({
		i18n: new Proxy(
			{},
			{
				get: (_target, key) =>
					key === "_"
						? (input: { message: string }) => input.message
						: undefined,
			},
		),
	}));
	let organizationId = "o";
	let calls: { host: string; input: Record<string, unknown> }[] = [];
	let response: (
		input: Record<string, unknown>,
	) => Promise<Record<string, unknown>> = async (input) => ({
		provider: "gitlab",
		expectedIssueUrl: input.expectedIssueUrl,
		url: input.expectedIssueUrl,
		number: input.issueNumber,
		body: "Verified body",
	});
	mock.module("renderer/hooks/useActiveOrganizationId", () => ({
		useActiveOrganizationId: () => organizationId,
	}));
	mock.module("renderer/hooks/useRelayUrl", () => ({
		useRelayUrl: () => "https://relay.example",
	}));
	mock.module(
		"renderer/routes/_authenticated/providers/LocalHostServiceProvider",
		() => ({
			useLocalHostService: () => ({
				machineId: "h",
				activeHostUrl: "https://relay.example/h",
			}),
		}),
	);
	mock.module("renderer/hooks/host-service/useHostTargetUrl", () => ({
		resolveHostUrl: (input: { hostId: string; organizationId: string }) =>
			`https://relay.example/${input.organizationId}/${input.hostId}`,
	}));
	mock.module("renderer/lib/api-trpc-client", () => ({ apiTrpcClient: {} }));
	mock.module("renderer/lib/host-service-client", () => ({
		getHostServiceClientByUrl: (host: string) => ({
			issues: {
				getContent: {
					query: async (input: Record<string, unknown>) => {
						calls.push({ host, input });
						return response(input);
					},
				},
			},
		}),
	}));
	const React = await import("react");
	const { createRoot } = await import("react-dom/client");
	const { useNewWorkspacePromptContext } = await import(
		process.env.SUPERSET_ISSUE_HOOK_BASELINE_FILE ??
			"./useNewWorkspacePromptContext"
	);
	const { linkedIssueFromGitLab } = await import(
		"renderer/routes/_authenticated/utils/linkedIssueFromGitLab"
	);
	const { useNewWorkspacePromptContextStore: store } = await import("./store");
	const issue = (host = "git.example:8443") =>
		required(
			linkedIssueFromGitLab({
				projectId: "p",
				hostId: "h",
				hostUrl: "https://relay.example/o/h",
				issueNumber: 7,
				title: "Native issue",
				url: `https://${host}/Group/Sub/Repo/-/issues/7`,
				state: "opened",
			}),
		);
	let args = {
		projectId: "p",
		hostId: "h",
		linkedPR: null,
		linkedIssues: [issue()],
	};
	let api: NewWorkspacePromptContextApi | undefined;
	const Harness = () => {
		api = useNewWorkspacePromptContext(args);
		return null;
	};
	let root: ReturnType<typeof createRoot> | undefined;
	let element: HTMLElement | undefined;
	const render = async () => {
		if (!root) {
			element = document.createElement("div");
			document.body.append(element);
			root = createRoot(element);
		}
		await React.act(async () => {
			required(root).render(<Harness />);
			await Promise.resolve();
		});
	};
	const build = () =>
		required(api).build({
			userPrompt: "Investigate",
			linkedPR: null,
			linkedIssues: args.linkedIssues,
			timeoutMs: 20,
		});
	afterEach(async () => {
		if (root) await React.act(async () => required(root).unmount());
		root = undefined;
		element?.remove();
		store.setState({ entries: new Map() });
		organizationId = "o";
		args = {
			projectId: "p",
			hostId: "h",
			linkedPR: null,
			linkedIssues: [issue()],
		};
		calls = [];
		response = async (input) => ({
			provider: "gitlab",
			expectedIssueUrl: input.expectedIssueUrl,
			url: input.expectedIssueUrl,
			number: input.issueNumber,
			body: "Verified body",
		});
	});
	test("selected native issue flows through real register/fetch/store/build", async () => {
		await render();
		expect(calls).toEqual([
			{
				host: "https://relay.example/o/h",
				input: {
					projectId: "p",
					issueNumber: 7,
					expectedIssueUrl: required(args.linkedIssues[0]).url,
				},
			},
		]);
		expect(await build()).toBe(
			`Investigate\n\n## Linked GitLab issue — #7: Native issue\n${required(args.linkedIssues[0]).url}\n\nVerified body`,
		);
	});
	test("cloud submission verifies the linked issue against its source host", async () => {
		await render();
		args = { ...args, projectId: "cloud-project", hostId: "cloud" };
		await render();
		expect(await build()).toContain("Verified body");
		expect(
			calls.every(
				(call) =>
					call.host === "https://relay.example/o/h" &&
					call.input.projectId === "p",
			),
		).toBe(true);
	});
	test("same IID native instances do not reuse descriptions", async () => {
		response = async (input) => ({
			provider: "gitlab",
			expectedIssueUrl: input.expectedIssueUrl,
			url: input.expectedIssueUrl,
			number: 7,
			body: String(input.expectedIssueUrl),
		});
		await render();
		const first = await build();
		args = { ...args, linkedIssues: [issue("other.example:8443")] };
		await render();
		const second = await build();
		expect(second).not.toBe(first);
		expect(second).toContain("other.example:8443");
		expect(calls).toHaveLength(2);
	});
	test("organization change cannot reuse content or retained build callback", async () => {
		await render();
		await build();
		const retained = required(api);
		organizationId = "other";
		await render();
		expect(calls.map((call) => call.host)).toEqual([
			"https://relay.example/o/h",
			"https://relay.example/other/h",
		]);
		await expect(
			retained.build({
				userPrompt: "Investigate",
				linkedPR: null,
				linkedIssues: args.linkedIssues,
				timeoutMs: 20,
			}),
		).rejects.toThrow();
		expect(await build()).toContain("Verified body");
	});
	test("selected project/host mismatch refuses before transport", async () => {
		args = { ...args, projectId: "other", hostId: "other" };
		await render();
		expect(calls).toEqual([]);
		await expect(build()).rejects.toThrow();
	});
	test("unacknowledged or contradictory content never becomes a prompt body", async () => {
		response = async () => ({
			provider: "github",
			number: 7,
			url: required(args.linkedIssues[0]).url,
			body: "Foreign body",
		});
		await render();
		await expect(build()).rejects.toThrow();
		expect(
			[...store.getState().entries.values()].map((entry) => entry.state),
		).toEqual(["failed"]);
	});
	test("selection change during pending fetch rejects the retained callback", async () => {
		let finish: ((value: Record<string, unknown>) => void) | undefined;
		response = () =>
			new Promise((resolve) => {
				finish = resolve;
			});
		await render();
		const retained = required(api);
		const pending = retained.build({
			userPrompt: "Investigate",
			linkedPR: null,
			linkedIssues: args.linkedIssues,
			timeoutMs: 200,
		});
		const rejection = expect(pending).rejects.toThrow();
		args = { ...args, projectId: "other" };
		await render();
		required(finish)({
			provider: "gitlab",
			expectedIssueUrl: required(args.linkedIssues[0]).url,
			url: required(args.linkedIssues[0]).url,
			number: 7,
			body: "Old body",
		});
		await rejection;
	});
	test("GH caller retains original request and default heading/body", async () => {
		args = {
			...args,
			linkedIssues: [
				{
					source: "github",
					slug: "gh-7",
					title: "GH",
					number: 7,
					url: "https://github.com/T/R/issues/7",
				},
			],
		};
		response = async () => ({ body: "GH body" });
		await render();
		expect(calls).toEqual([
			{
				host: "https://relay.example/o/h",
				input: { projectId: "p", issueNumber: 7 },
			},
		]);
		expect(await build()).toBe(
			"Investigate\n\n## Linked GitHub issue — #7: GH\nhttps://github.com/T/R/issues/7\n\nGH body",
		);
	});
}

function required<T>(value: T | null | undefined): T {
	if (value == null) throw Error("Required fixture value missing");
	return value;
}
