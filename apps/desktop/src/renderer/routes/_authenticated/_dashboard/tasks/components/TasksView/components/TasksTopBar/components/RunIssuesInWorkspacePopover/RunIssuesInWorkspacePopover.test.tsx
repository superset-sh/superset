import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: Own the isolated test child's directory.
import { mkdtempSync, rmSync } from "node:fs";
import type { MouseEventHandler, ReactNode } from "react";
import type { SelectedIssue } from "../../../GitHubIssuesContent";

if (process.env.SUPERSET_I3_FIXTURE !== "1") {
	test("issue producer uses an isolated real React caller", () => {
		const cwd = mkdtempSync("/tmp/superset-issue-producer-");
		try {
			const child = Bun.spawnSync(
				[process.execPath, "--no-env-file", "test", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_I3_FIXTURE: "1",
					},
					stdout: "pipe",
					stderr: "pipe",
					timeout: 30000,
				},
			);
			process.stdout.write(child.stdout);
			process.stderr.write(child.stderr);
			expect(child.exitCode).toBe(0);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	}, 35000);
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
		{ preconnect() {} },
	);
	// biome-ignore lint/style/noRestrictedImports: Deny sockets before importing application callers.
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
	const dotenvName: string = "dotenv";
	mock.module(dotenvName, () => ({
		config: () => {
			throw Error("Environment denied");
		},
	}));
	const React = await import("react"),
		{ createRoot } = await import("react-dom/client");
	const t = (input: { message: string }) => input.message;
	const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
	const Button = (p: {
		children?: ReactNode;
		onClick?: MouseEventHandler<HTMLButtonElement>;
		disabled?: boolean;
		title?: string;
		"aria-label"?: string;
	}) => (
		<button
			type="button"
			onClick={p.onClick}
			disabled={p.disabled}
			title={p.title}
			aria-label={p["aria-label"]}
		>
			{p.children}
		</button>
	);
	mock.module("@lingui/react/macro", () => ({
		useLingui: () => ({ t }),
		Trans: Box,
		Plural: ({
			one,
			other,
			value,
		}: {
			one: string;
			other: string;
			value: number;
		}) => <span>{value === 1 ? one : other}</span>,
	}));
	mock.module("@lingui/core/macro", () => ({
		msg: (x: unknown) => x,
		plural: (_n: number, x: { one: string; other: string }) => x.other,
	}));
	mock.module("@superset/i18n", () => ({
		i18n: new Proxy({}, { get: (_t, k) => (k === "_" ? t : undefined) }),
	}));
	mock.module("@superset/ui/button", () => ({ Button }));
	mock.module("@superset/ui/scroll-area", () => ({ ScrollArea: Box }));
	mock.module("@superset/ui/checkbox", () => ({
		Checkbox: (p: {
			checked: boolean;
			onCheckedChange: (v: boolean) => void;
			"aria-label"?: string;
		}) => (
			<input
				type="checkbox"
				checked={p.checked}
				aria-label={p["aria-label"]}
				onChange={(e) => p.onCheckedChange(e.currentTarget.checked)}
			/>
		),
	}));
	mock.module("@superset/ui/popover", () => ({
		Popover: ({
			children,
			onOpenChange,
			open,
		}: {
			children?: ReactNode;
			onOpenChange?: (v: boolean) => void;
			open?: boolean;
		}) => (
			<div>
				<button
					type="button"
					data-fixture-open
					onClick={() => onOpenChange?.(!open)}
				>
					Open popover
				</button>
				{children}
			</div>
		),
		PopoverTrigger: Box,
		PopoverContent: Box,
	}));
	mock.module("@superset/ui/tooltip", () => ({
		Tooltip: Box,
		TooltipTrigger: Box,
		TooltipContent: Box,
	}));
	mock.module("@superset/ui/command", () => ({
		Command: Box,
		CommandEmpty: Box,
		CommandGroup: Box,
		CommandList: Box,
		CommandInput: () => null,
		CommandItem: (p: { children?: ReactNode; onSelect: () => void }) => (
			<button type="button" data-fixture-select onClick={p.onSelect}>
				{p.children}
			</button>
		),
	}));
	let errors: string[] = [],
		promises: Promise<unknown>[] = [];
	mock.module("@superset/ui/sonner", () => ({
		toast: {
			error: (v: string) => errors.push(v),
			promise: (
				p: Promise<unknown>,
				options: { error: (err: unknown) => string },
			) => {
				promises.push(p);
				p.catch((err) => errors.push(options.error(err)));
			},
		},
	}));
	const { QueryClient, QueryClientProvider } = await import(
		"@tanstack/react-query"
	);
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: 0 } },
	});
	const { useNewWorkspaceDraftStore: draft } = await import(
		"renderer/stores/new-workspace-draft"
	);
	const { linkedIssueFromGitLab } = await import(
		"renderer/routes/_authenticated/utils/linkedIssueFromGitLab"
	);
	const native = {
		projectId: "p",
		hostId: "h",
		hostUrl: "https://relay.example/o/h",
		issueNumber: 7,
		title: "Native issue",
		url: "https://git.example:8443/Group/Sub/Repo/-/issues/7",
		state: "opened",
	};
	const gh = {
		...native,
		url: "https://github.com/Owner/Repo/issues/7",
		title: "GH issue",
		state: "OPEN",
	};
	let root: ReturnType<typeof createRoot> | undefined,
		element: HTMLDivElement | undefined;
	const required = <T,>(value: T | null | undefined): T => {
		if (value === null || value === undefined)
			throw Error("Missing fixture value");
		return value;
	};
	const render = async (node: ReactNode) => {
		if (!root) {
			element = document.createElement("div");
			document.body.append(element);
			root = createRoot(element);
		}
		await React.act(async () => {
			required(root).render(
				<QueryClientProvider client={client}>{node}</QueryClientProvider>,
			);
			await new Promise((r) => setTimeout(r, 5));
		});
		await React.act(async () => {
			await new Promise((r) => setTimeout(r, 5));
		});
	};
	const flush = async () => {
		await React.act(async () => {
			await new Promise((r) => setTimeout(r, 10));
		});
	};
	afterEach(async () => {
		if (root) await React.act(() => root?.unmount());
		root = undefined;
		element?.remove();
		element = undefined;
		client.clear();
		draft.getState().resetDraft();
		errors = [];
		promises = [];
	});

	let contentGate: Promise<void> | null = null;
	let submitted: Record<string, unknown>[] = [],
		calls: unknown[] = [],
		completed = 0,
		body = "Complete verified native issue body",
		responseMode = "valid";
	const defaults = {
		lastHostId: "h",
		setLastHostId() {},
		setLastProjectId() {},
	};
	mock.module("renderer/stores/v2-workspace-create-defaults", () => ({
		useV2WorkspaceCreateDefaultsStore: (
			selector: (x: typeof defaults) => unknown,
		) => selector(defaults),
	}));
	mock.module(
		"renderer/routes/_authenticated/providers/LocalHostServiceProvider",
		() => ({
			useLocalHostService: () => ({
				machineId: "h",
				activeHostUrl: native.hostUrl,
			}),
		}),
	);
	mock.module("renderer/hooks/host-service/useHostTargetUrl", () => ({
		useHostUrl: () => native.hostUrl,
	}));
	mock.module("renderer/hooks/useSelectedHostProjectIds", () => ({
		useSelectedHostProjectIds: () => new Set(["p", "other"]),
	}));
	const projects = [
		{ id: "p", name: "Repo", iconUrl: null },
		{ id: "other", name: "Other", iconUrl: null },
	];
	mock.module("renderer/hooks/host-projects/useRecentProjects", () => ({
		useRecentProjects: () => projects,
	}));
	mock.module("renderer/hooks/useV2AgentChoices", () => ({
		useV2AgentChoices: () => ({
			agents: [{ id: "agent", name: "Agent" }],
			isFetched: true,
		}),
	}));
	mock.module("renderer/components/AgentSelect", () => ({
		AgentSelect: () => null,
	}));
	mock.module(
		"renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker",
		() => ({ DevicePicker: () => null }),
	);
	mock.module(
		"renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions",
		() => ({ useWorkspaceHostOptions: () => ({ otherHosts: [] }) }),
	);
	mock.module(
		"renderer/routes/_authenticated/components/ProjectThumbnail",
		() => ({ ProjectThumbnail: () => null }),
	);
	mock.module("renderer/lib/api-trpc-client", () => ({ apiTrpcClient: {} }));
	mock.module("renderer/lib/host-service-client", () => ({
		getHostServiceClientByUrl: (host: string) => ({
			issues: {
				getContent: {
					query: async (input: Record<string, unknown>) => {
						calls.push({ host, input });
						if (contentGate) await contentGate;
						return {
							provider: responseMode === "valid" ? "gitlab" : "github",
							expectedIssueUrl: input.expectedIssueUrl,
							url: input.expectedIssueUrl,
							number: input.issueNumber,
							body,
						};
					},
				},
			},
		}),
	}));
	mock.module("renderer/stores/workspace-creates", () => ({
		useWorkspaceCreates: () => ({
			submit: (input: Record<string, unknown>) => {
				submitted.push(input);
				return { completed: Promise.resolve({ ok: true }) };
			},
		}),
	}));
	const { RunIssuesInWorkspacePopover } = await import(
		"./RunIssuesInWorkspacePopover"
	);
	beforeEach(() => {
		contentGate = null;
		submitted = [];
		calls = [];
		completed = 0;
		body = "Complete verified native issue body";
		responseMode = "valid";
		window.localStorage.setItem("lastSelectedV2IssueBatchAgent", "agent");
	});
	const selected = () => ({
		...native,
		gitlab: required(linkedIssueFromGitLab(native)).gitlab,
	});
	const mount = async (
		issues: SelectedIssue[] = [selected()],
		projectFilter = "p",
	) => {
		await render(
			<RunIssuesInWorkspacePopover
				issues={issues}
				projectFilter={projectFilter}
				onComplete={() => completed++}
			/>,
		);
	};
	const run = async () => {
		const b = Array.from(required(element).querySelectorAll("button")).find(
			(b) => b.textContent?.includes("Run # Workspace"),
		);
		await React.act(async () => {
			required(b).click();
			await new Promise((r) => setTimeout(r, 10));
		});
	};
	test("actual native batch obtains acknowledged full content before creation", async () => {
		await mount();
		await run();
		await Promise.allSettled(promises);
		expect(calls).toEqual([
			{
				host: native.hostUrl,
				input: { projectId: "p", issueNumber: 7, expectedIssueUrl: native.url },
			},
		]);
		expect(submitted).toHaveLength(1);
		expect(submitted[0]).toMatchObject({
			hostId: "h",
			snapshot: {
				projectId: "p",
				agents: [
					{
						agent: "agent",
						prompt: `GitLab issue #7: Native issue\n${native.url}\n\n${body}`,
					},
				],
			},
		});
		expect(completed).toBe(1);
	});
	test("native batch project mismatch refuses before content/create", async () => {
		await mount([selected()], "other");
		await run();
		expect(calls).toEqual([]);
		expect(submitted).toEqual([]);
		expect(completed).toBe(0);
	});
	test("native batch host mismatch refuses before content/create", async () => {
		await mount([
			{
				...selected(),
				gitlab: { ...required(selected().gitlab), hostId: "foreign" },
			},
		]);
		await run();
		expect(calls).toEqual([]);
		expect(submitted).toEqual([]);
	});
	test("native batch old-host acknowledgment failure never launches incomplete context", async () => {
		responseMode = "old-host";
		await mount();
		await run();
		await Promise.allSettled(promises);
		expect(submitted).toEqual([]);
		expect(completed).toBe(0);
		expect(errors).toContain("GitLab issue content could not be verified");
	});
	test("genuine verified empty native body still permits creation", async () => {
		body = "";
		await mount();
		await run();
		await Promise.allSettled(promises);
		expect(submitted).toHaveLength(1);
	});
	test("native pending batch target change refuses before creation", async () => {
		let release: (() => void) | undefined;
		contentGate = new Promise<void>((r) => {
			release = r;
		});
		await mount();
		await run();
		const other = Array.from(
			required(element).querySelectorAll("[data-fixture-select]"),
		).find((e) => e.textContent?.includes("Other"));
		await React.act(() =>
			required(other).dispatchEvent(new MouseEvent("click", { bubbles: true })),
		);
		required(release)();
		await flush();
		await Promise.allSettled(promises);
		expect(submitted).toEqual([]);
		expect(completed).toBe(0);
	});
	test("native pending batch unmount refuses before creation", async () => {
		let release: (() => void) | undefined;
		contentGate = new Promise<void>((r) => {
			release = r;
		});
		await mount();
		await run();
		await React.act(() => required(root).unmount());
		root = undefined;
		required(release)();
		await flush();
		await Promise.allSettled(promises);
		expect(submitted).toEqual([]);
		expect(completed).toBe(0);
	});
	test("native pending double click has one content request and one creation", async () => {
		let release: (() => void) | undefined;
		contentGate = new Promise<void>((r) => {
			release = r;
		});
		await mount();
		await run();
		await run();
		required(release)();
		await flush();
		await Promise.allSettled(promises);
		expect(calls).toHaveLength(1);
		expect(submitted).toHaveLength(1);
		expect(completed).toBe(1);
	});

	test("original GH batch submits synchronously with original prompt", async () => {
		await mount([gh]);
		await run();
		expect(calls).toEqual([]);
		expect(submitted[0]).toMatchObject({
			snapshot: {
				agents: [
					{ agent: "agent", prompt: `GitHub issue #7: GH issue\n${gh.url}` },
				],
			},
		});
		expect(completed).toBe(1);
	});
}
