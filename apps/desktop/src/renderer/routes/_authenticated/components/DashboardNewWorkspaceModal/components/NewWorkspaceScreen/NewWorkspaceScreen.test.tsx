import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: Own the isolated test child's directory.
import { mkdtempSync, rmSync } from "node:fs";
import type {
	ComponentProps,
	KeyboardEventHandler,
	MouseEventHandler,
	ReactNode,
} from "react";
import type { HostProjectItem } from "renderer/hooks/host-projects/useHostProjects/useHostProjects.utils";
import type { CompareBaseBranchPicker as BranchPickerComponent } from "../DashboardNewWorkspaceForm/PromptGroup/components/CompareBaseBranchPicker/CompareBaseBranchPicker";
import type { ProjectPickerPill as ProjectPickerComponent } from "../DashboardNewWorkspaceForm/PromptGroup/components/ProjectPickerPill/ProjectPickerPill";

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
		initI18n: () => {},
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
		Command: (p: {
			children?: ReactNode;
			onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
			onValueChange?: (value: string) => void;
		}) => (
			<div
				data-fixture-command
				onKeyDown={p.onKeyDown}
				role="combobox"
				aria-expanded={true}
				tabIndex={0}
			>
				<button
					type="button"
					data-fixture-highlight
					onClick={() => p.onValueChange?.("feature")}
				>
					Highlight feature
				</button>
				{p.children}
			</div>
		),
		CommandEmpty: Box,
		CommandGroup: Box,
		CommandList: Box,
		CommandInput: () => null,
		CommandItem: (p: { children?: ReactNode; onSelect: () => void }) => (
			<div
				data-fixture-select
				onClick={p.onSelect}
				onKeyDown={(event) => {
					if (event.key === "Enter" && !event.metaKey && !event.ctrlKey)
						p.onSelect();
				}}
				role="option"
				aria-selected={false}
				tabIndex={0}
			>
				{p.children}
			</div>
		),
	}));
	let errors: string[] = [],
		promises: Promise<unknown>[] = [];
	mock.module("@superset/ui/sonner", () => ({
		toast: {
			error: (v: string) => errors.push(v),
			promise: (p: Promise<unknown>) => {
				promises.push(p);
				p.catch(() => {});
			},
		},
	}));
	const { QueryClient, QueryClientProvider, useQuery } = await import(
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
	const click = async (selector: string) => {
		const e = required(element?.querySelector<HTMLElement>(selector));
		await React.act(async () => {
			e.click();
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

	const branchOpens: unknown[] = [],
		cloudSubmits: unknown[] = [];
	let branchPickerProps:
		| ComponentProps<typeof BranchPickerComponent>
		| undefined;
	let branchError = false,
		branchLoading = false;
	let environmentProps:
		| {
				onSelectEnvironment: (id: string) => void;
				selectedEnvironment?: { id: string };
		  }
		| undefined;
	let branchArgs:
		| {
				cloudRepository?: unknown;
				onBaseBranchChange: (
					branch: string | null,
					source: "local" | "remote-tracking" | null,
				) => void;
		  }
		| undefined;
	const noop = () => {};
	const emptyFiles: never[] = [];
	mock.module("@superset/ui/ai-elements/prompt-input", () => ({
		PromptInput: Box,
		PromptInputButton: Button,
		PromptInputFooter: Box,
		PromptInputTools: Box,
		PromptInputSubmit: Button,
		useProviderAttachments: () => ({
			files: emptyFiles,
			add: noop,
			remove: noop,
			openFileDialog: noop,
		}),
	}));
	mock.module("@superset/ui/spinner", () => ({ Spinner: () => null }));
	mock.module("framer-motion", () => ({
		AnimatePresence: Box,
		motion: { div: Box },
	}));
	mock.module("@tanstack/react-router", () => ({ useNavigate: () => noop }));
	mock.module("renderer/lib/analytics", () => ({ track: noop }));
	mock.module("renderer/lib/electron-trpc", () => ({
		electronTrpc: {
			external: { openInFinder: { useMutation: () => ({ mutate: noop }) } },
		},
	}));
	const nativeCloudProject = {
		connectionId: "connection",
		projectId: "17",
		pathWithNamespace: "Acme/Team/Widget",
		cloneUrl: "https://git.fixture.invalid/Acme/Team/Widget.git",
		defaultBranch: "release",
	};
	const nativeCloudEnv = {
		id: "native-env",
		name: "Native env",
		sandboxReady: true,
		repositories: [],
		gitlabProject: nativeCloudProject,
	};
	const githubCloudEnv = {
		...nativeCloudEnv,
		id: "gh-env",
		name: "GH env",
		gitlabProject: null,
		repositories: [{ owner: "Acme", name: "Widget", defaultBranch: "trunk" }],
	};
	let cloudEnvironments: Array<typeof nativeCloudEnv | typeof githubCloudEnv> =
		[nativeCloudEnv];
	let cloudFail = false,
		cloudBlock: Promise<void> | undefined,
		organization = "o";
	mock.module("renderer/lib/cloud-trpc", () => ({
		cloudTrpc: {
			environment: {
				list: {
					useQuery: (
						input: { organizationId: string },
						options: { enabled: boolean },
					) =>
						useQuery({
							queryKey: ["fixture-environments", input.organizationId],
							enabled: options.enabled,
							queryFn: async () => {
								await cloudBlock;
								if (cloudFail) throw Error("Owned cloud list failure");
								return cloudEnvironments;
							},
						}),
				},
			},
		},
	}));
	type FixtureProject = Pick<HostProjectItem, "projectKey" | "name"> &
		Partial<HostProjectItem>;
	let hostProjects: FixtureProject[] = [{ projectKey: "p", name: "Repo" }];
	const projectPicker: {
		current?: ComponentProps<typeof ProjectPickerComponent>;
	} = {};
	mock.module("renderer/hooks/host-projects/useHostProjects", () => ({
		useHostProjects: () => ({
			isReady: true,
			projects: hostProjects,
		}),
	}));
	mock.module("renderer/hooks/host-service/useHostTargetUrl", () => ({
		useHostUrl: (id: string | null) => `https://relay.example/o/${id ?? "h"}`,
		resolveHostUrl: (args: { hostId: string }) =>
			`https://relay.example/o/${args.hostId}`,
	}));
	mock.module("renderer/hooks/useActiveOrganizationId", () => ({
		useActiveOrganizationId: () => organization,
	}));
	mock.module("renderer/hooks/useRelayUrl", () => ({
		useRelayUrl: () => "https://relay.example",
	}));
	mock.module("renderer/hooks/useSelectedHostProjectIds", () => ({
		useSelectedHostProjectIds: () => new Set(["p"]),
	}));
	mock.module("renderer/hooks/usePluginMentionOptions", () => ({
		usePluginMentionOptions: () => [],
	}));
	mock.module("renderer/hooks/useV2AgentChoices", () => ({
		useV2AgentChoices: () => ({ agents: [], isFetched: true }),
	}));
	mock.module("renderer/hooks/useAgentLaunchPreferences", () => ({
		useAgentLaunchPreferences: () => ({
			selectedAgent: "none",
			setSelectedAgent: noop,
		}),
	}));
	mock.module("renderer/hooks/useAgentModelPreference", () => ({
		useAgentModelPreference: () => ({
			selectedModel: null,
			setSelectedModel: noop,
		}),
	}));
	mock.module("renderer/hooks/useAgentEffortPreference", () => ({
		useAgentEffortPreference: () => ({
			selectedEffort: null,
			setSelectedEffort: noop,
		}),
	}));
	mock.module("renderer/hooks/useAgentModePreference", () => ({
		useAgentModePreference: () => ({
			selectedMode: null,
			setSelectedMode: noop,
		}),
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
	mock.module(
		"renderer/routes/_authenticated/providers/HostWorkspacesProvider",
		() => ({ useHostWorkspaces: () => ({ workspaces: [] }) }),
	);
	let storedHostId: string | null = "h";
	const defaults = {
		lastProjectId: "p",
		lastHostId: "h",
		samplePromptsDismissed: true,
		baseBranchesByProjectId: {},
		setLastProjectId: noop,
		setLastHostId: noop,
		setSamplePromptsDismissed: noop,
		setBaseBranchDefault: noop,
		clearBaseBranchDefault: noop,
	};
	mock.module("renderer/stores/v2-workspace-create-defaults", () => ({
		useV2WorkspaceCreateDefaultsStore: Object.assign(
			(s: (d: typeof defaults) => unknown) => s(defaults),
			{ getState: () => ({ ...defaults, lastHostId: storedHostId }) },
		),
	}));
	const width = { screenWidth: null, setScreenWidth: noop };
	mock.module("renderer/stores/new-workspace-width", () => ({
		NEW_WORKSPACE_SCREEN_DEFAULT_WIDTH: 500,
		NEW_WORKSPACE_SCREEN_MAX_WIDTH: 800,
		NEW_WORKSPACE_SCREEN_MIN_WIDTH: 300,
		useNewWorkspaceWidthStore: (s: (d: typeof width) => unknown) => s(width),
	}));
	mock.module("renderer/stores/new-workspace-attachments", () => ({
		newWorkspaceAttachmentPaths: new Map(),
	}));
	mock.module("renderer/stores/new-workspace-prompt-context", () => ({
		useNewWorkspacePromptContext: () => ({ build: async () => "prompt" }),
	}));
	mock.module("renderer/hooks/useDebouncedValue", () => ({
		useDebouncedValue: (s: unknown) => s,
	}));
	let rows = [native],
		searchCalls: unknown[] = [];
	mock.module("renderer/lib/host-service-client", () => ({
		getHostServiceClientByUrl: (host: string) => ({
			workspaceCreation: {
				searchGitHubIssues: {
					query: async (input: unknown) => {
						searchCalls.push({ host, input });
						return { issues: rows };
					},
				},
			},
		}),
	}));
	mock.module("renderer/components/AgentSelect", () => ({
		AgentSelect: () => null,
	}));
	mock.module("renderer/components/AgentModelSelect", () => ({
		AgentModelSelect: () => null,
	}));
	mock.module("renderer/components/GitHubStarPill", () => ({
		GitHubStarPill: () => null,
	}));
	mock.module("renderer/components/IssueLinkCommand", () => ({
		IssueLinkCommand: () => null,
	}));
	mock.module("renderer/components/LinkedIssuePill", () => ({
		LinkedIssuePill: () => <span>Task pill</span>,
	}));
	mock.module(
		"renderer/routes/_authenticated/components/AgentComposer",
		() => ({
			AgentComposer: (props: {
				header?: ReactNode;
				toolbar?: ReactNode;
				toolbarEnd?: ReactNode;
			}) => (
				<div>
					{props.header}
					{props.toolbar}
					{props.toolbarEnd}
				</div>
			),
		}),
	);
	mock.module(
		"renderer/routes/_authenticated/_dashboard/components/PageHeader",
		() => ({ PageHeader: (p: { end?: ReactNode }) => <div>{p.end}</div> }),
	);
	mock.module("../DashboardNewWorkspaceForm/components/DevicePicker", () => ({
		DevicePicker: () => null,
	}));
	mock.module(
		"../DashboardNewWorkspaceForm/PromptGroup/components/CheckoutPickerPill",
		() => ({ CheckoutPickerPill: () => null }),
	);
	mock.module(
		"../DashboardNewWorkspaceForm/PromptGroup/components/CompareBaseBranchPicker",
		() => ({
			CompareBaseBranchPicker: (props: typeof branchPickerProps) => {
				branchPickerProps = props;
				return null;
			},
		}),
	);
	mock.module(
		"../DashboardNewWorkspaceForm/PromptGroup/components/EnvironmentPickerPill",
		() => ({
			EnvironmentPickerPill: (props: {
				onSelectEnvironment: (id: string) => void;
				selectedEnvironment?: { id: string };
			}) => {
				environmentProps = props;
				return null;
			},
		}),
	);
	mock.module(
		"../DashboardNewWorkspaceForm/PromptGroup/components/LinearIssueLinkCommand",
		() => ({ LinearIssueLinkCommand: () => null }),
	);
	mock.module(
		"../DashboardNewWorkspaceForm/PromptGroup/components/LinkedPRPill",
		() => ({ LinkedPRPill: () => null }),
	);
	mock.module(
		"../DashboardNewWorkspaceForm/PromptGroup/components/PRLinkCommand",
		() => ({ PRLinkCommand: () => null }),
	);
	mock.module(
		"../DashboardNewWorkspaceForm/PromptGroup/components/ProjectPickerPill",
		() => ({
			ProjectPickerPill: (
				props: ComponentProps<typeof ProjectPickerComponent>,
			) => {
				projectPicker.current = props;
				return null;
			},
		}),
	);
	mock.module(
		"../DashboardNewWorkspaceForm/PromptGroup/components/PromptHistoryCommand",
		() => ({ PromptHistoryCommand: () => null }),
	);
	mock.module("../SymmetricResizeHandles", () => ({
		SymmetricResizeHandles: () => null,
	}));
	mock.module("./components/AttachmentCard", () => ({
		AttachmentCard: () => null,
	}));
	mock.module("./components/SamplePromptCards", () => ({
		SamplePromptCards: () => null,
	}));
	mock.module("./components/SamplePrompts", () => ({
		SamplePrompts: () => null,
	}));
	mock.module("./components/SupersetIcon", () => ({
		SupersetIcon: () => null,
	}));

	const observedDraftUpdates: unknown[] = [];
	const recordDraftUpdate = (
		...args: Parameters<ReturnType<typeof draft.getState>["updateDraft"]>
	) => {
		observedDraftUpdates.push(args[0]);
		draft.getState().updateDraft(...args);
	};
	mock.module("../../DashboardNewWorkspaceDraftContext", () => ({
		useDashboardNewWorkspaceDraft: () => {
			const state = draft();
			return {
				...state,
				draft: state,
				updateDraft: recordDraftUpdate,
				closeModal: noop,
				resetKey: 0,
			};
		},
	}));
	mock.module("../../hooks/useNewWorkspacePromptCardsVariant", () => ({
		useNewWorkspacePromptCardsVariant: () => null,
	}));
	mock.module("./components/SamplePrompts/constants", () => ({
		PROMPT_PLACEHOLDERS: [{ message: "Prompt" }],
	}));
	mock.module("./hooks/useProjectPreselection", () => ({
		useProjectPreselection: () => false,
	}));
	mock.module("./hooks/useSamplePromptSelection", () => ({
		useSamplePromptSelection: () => ({ prompts: [], isPending: false }),
	}));
	mock.module(
		"../DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions",
		() => ({
			useWorkspaceHostOptions: () => ({
				otherHosts: [{ id: "h2", isOnline: true }],
			}),
		}),
	);
	mock.module(
		"../DashboardNewWorkspaceForm/PromptGroup/hooks/useBranchPickerController",
		() => ({
			useBranchPickerController: (args: {
				cloudRepository?: unknown;
				onBaseBranchChange: (
					branch: string | null,
					source: "local" | "remote-tracking" | null,
				) => void;
			}) => {
				branchArgs = args;
				return {
					pickerProps: {
						onSelectCompareBaseBranch: args.onBaseBranchChange,
						onOpenWorkspace: (target: unknown) => branchOpens.push(target),
						branches: [
							{
								name: "feature",
								isRemote: true,
								isLocal: false,
								lastCommitDate: 0,
								recency: null,
								worktreePath: null,
								hasWorkspace: false,
								isCheckedOut: false,
							},
						],
						effectiveCompareBaseBranch: null,
						branchSearch: "",
						onBranchSearchChange: noop,
						branchFilter: "all",
						onBranchFilterChange: noop,
						isFetchingNextPage: false,
						hasNextPage: false,
						onLoadMore: noop,
						isBranchesError: branchError,
						isBranchesLoading: branchLoading,
						defaultBranch: "release",
					},
				};
			},
		}),
	);
	mock.module(
		"../DashboardNewWorkspaceForm/PromptGroup/hooks/useUploadAttachments",
		() => ({
			CLOUD_UPLOAD_TARGET: "cloud",
			useUploadAttachments: () => noop,
			useFileIdsForHost: () => [],
		}),
	);
	mock.module(
		"../DashboardNewWorkspaceForm/PromptGroup/hooks/useSubmitWorkspace",
		() => ({
			useSubmitWorkspace: () => ({
				submitWorkspace: async (selection?: unknown) => {
					cloudSubmits.push(selection);
				},
				isCreating: false,
			}),
		}),
	);
	mock.module("renderer/hotkeys", () => ({ PLATFORM: "mac" }));
	const { NewWorkspaceScreen } = await import("./NewWorkspaceScreen");
	beforeEach(() => {
		hostProjects = [{ projectKey: "p", name: "Repo" }];
		projectPicker.current = undefined;
		storedHostId = "h";
		organization = "o";
		cloudEnvironments = [nativeCloudEnv];
		cloudFail = false;
		cloudBlock = undefined;
		environmentProps = undefined;
		branchArgs = undefined;
		branchPickerProps = undefined;
		branchOpens.length = 0;
		cloudSubmits.length = 0;
		branchError = false;
		branchLoading = false;
		rows = [native];
		searchCalls = [];
		draft.getState().selectProject("p");
		draft.getState().updateDraft({ hostId: "h" });
	});
	const mount = async () => {
		await render(<NewWorkspaceScreen isOpen={true} preSelectedProjectId="p" />);
	};
	const select = async () => {
		await click("[data-fixture-open]");
		await flush();
		await click("[data-fixture-select]");
	};
	test("actual screen manual native picker reaches real linked hook/store and native issue pill", async () => {
		await mount();
		await select();
		const expected = linkedIssueFromGitLab(native);
		if (!expected) throw new Error("Native issue fixture must be valid");
		expect(draft.getState().linkedIssues).toEqual([expected]);
		expect(element?.textContent).toContain("GitLab");
		expect(element?.textContent).not.toContain("Task pill");
		expect(searchCalls).toHaveLength(1);
	});
	test("actual screen keeps identical native issue on separately selected serving host distinct", async () => {
		await mount();
		await select();
		await React.act(() => draft.getState().updateDraft({ hostId: "h2" }));
		await select();
		expect(draft.getState().linkedIssues).toHaveLength(2);
		expect(draft.getState().linkedIssues.map((x) => x.gitlab?.hostId)).toEqual([
			"h",
			"h2",
		]);
	});
	test("same native URL on two serving hosts has unique React keys and independently removable pills", async () => {
		const duplicateKeys: unknown[][] = [];
		const originalError = console.error;
		const errorSpy = spyOn(console, "error").mockImplementation(
			(...args: unknown[]) => {
				if (typeof args[0] === "string" && args[0].includes("same key"))
					duplicateKeys.push(args);
				else originalError(...args);
			},
		);
		try {
			await mount();
			await select();
			await React.act(() => draft.getState().updateDraft({ hostId: "h2" }));
			await select();
			expect(draft.getState().linkedIssues).toHaveLength(2);
			expect(duplicateKeys).toEqual([]);
			const second = required(element).querySelectorAll<HTMLButtonElement>(
				'[aria-label="Remove linked issue"]',
			)[1];
			await React.act(() => required(second).click());
			expect(
				draft.getState().linkedIssues.map((issue) => issue.gitlab?.hostId),
			).toEqual(["h"]);
			expect(
				required(element).querySelectorAll(
					'[aria-label="Remove linked issue"]',
				),
			).toHaveLength(1);
			await click('[aria-label="Remove linked issue"]');
			expect(draft.getState().linkedIssues).toEqual([]);
			expect(
				required(element).querySelectorAll(
					'[aria-label="Remove linked issue"]',
				),
			).toHaveLength(0);
		} finally {
			errorSpy.mockRestore();
		}
	});
	test("actual screen native removal uses full slug and leaves GH same IID", async () => {
		await mount();
		await select();
		await React.act(() =>
			draft.getState().updateDraft({
				linkedIssues: [
					...draft.getState().linkedIssues,
					{
						slug: "#7",
						source: "github",
						title: gh.title,
						number: 7,
						url: gh.url,
						state: "open",
					},
				],
			}),
		);
		const removes = required(element).querySelectorAll<HTMLButtonElement>(
			'[aria-label="Remove linked issue"]',
		);
		await React.act(() => required(removes[0]).click());
		expect(draft.getState().linkedIssues).toEqual([
			{
				slug: "#7",
				source: "github",
				title: gh.title,
				number: 7,
				url: gh.url,
				state: "open",
			},
		]);
	});
	test("actual screen malformed native picker cannot become a GH issue", async () => {
		rows = [{ ...native, url: native.url.replace("Group", "%252f") }];
		await mount();
		await select();
		expect(draft.getState().linkedIssues).toEqual([]);
		expect(errors).toHaveLength(1);
	});
	test("actual screen default local host native manual selection remains usable", async () => {
		storedHostId = null;
		draft.getState().updateDraft({ hostId: null });
		await mount();
		expect(draft.getState().hostId).toBeNull();
		await select();
		const expected = linkedIssueFromGitLab(native);
		if (!expected) throw new Error("Native issue fixture must be valid");
		expect(draft.getState().linkedIssues).toEqual([expected]);
		expect(errors).toEqual([]);
	});

	test("actual screen original GH picker retains original handler draft and pill", async () => {
		rows = [gh];
		await mount();
		expect(
			element?.querySelector('[aria-label="Link repository issue"]') !== null,
		).toBe(true);
		await select();
		expect(draft.getState().linkedIssues).toEqual([
			{
				slug: "#7",
				source: "github",
				title: gh.title,
				number: 7,
				url: gh.url,
				state: "open",
			},
		]);
		expect(element?.textContent).toContain("GitHub");
		expect(element?.textContent).not.toContain("Task pill");
	});
	const cloudMount = async () => {
		storedHostId = "cloud";
		draft
			.getState()
			.updateDraft({ hostId: "cloud", environmentId: "native-env" });
		await mount();
		await flush();
	};
	test("actual cloud screen passes exact native binding without a synthetic GitHub repository", async () => {
		await cloudMount();
		expect(branchArgs?.cloudRepository).toEqual({
			provider: "gitlab",
			organizationId: "o",
			environmentId: "native-env",
			project: nativeCloudProject,
		});
		expect(environmentProps?.selectedEnvironment?.id).toBe("native-env");
	});
	test("GitHub to GitHub environment selection retains original environment-only draft update", async () => {
		cloudEnvironments = [
			githubCloudEnv,
			{ ...githubCloudEnv, id: "gh-second" },
		];
		storedHostId = "cloud";
		const linkedPR = {
			prNumber: 7,
			title: "GH PR",
			url: gh.url,
			state: "open",
		};
		draft.getState().updateDraft({
			hostId: "cloud",
			environmentId: "gh-env",
			selectedProjectId: null,
			baseBranch: "gh-feature",
			baseBranchSource: "remote-tracking",
			linkedPR,
		});
		await mount();
		await flush();
		observedDraftUpdates.length = 0;
		await React.act(() =>
			required(environmentProps).onSelectEnvironment("gh-second"),
		);
		expect(observedDraftUpdates).toEqual([{ environmentId: "gh-second" }]);
		expect(draft.getState()).toMatchObject({
			environmentId: "gh-second",
			baseBranch: "gh-feature",
			baseBranchSource: "remote-tracking",
			linkedPR,
		});
	});
	for (const direction of ["GitHub to native", "native to GitHub"])
		test(`${direction} environment selection clears branch source and linked PR`, async () => {
			cloudEnvironments = [githubCloudEnv, nativeCloudEnv];
			storedHostId = "cloud";
			const from = direction === "GitHub to native" ? "gh-env" : "native-env",
				to = direction === "GitHub to native" ? "native-env" : "gh-env";
			draft.getState().updateDraft({
				hostId: "cloud",
				environmentId: from,
				selectedProjectId: null,
			});
			await mount();
			await flush();
			await React.act(() =>
				draft.getState().updateDraft({
					baseBranch: "old-feature",
					baseBranchSource: "remote-tracking",
					linkedPR: {
						prNumber: 7,
						title: "Old PR",
						url: gh.url,
						state: "open",
					},
				}),
			);
			await React.act(() => required(environmentProps).onSelectEnvironment(to));
			expect(draft.getState()).toMatchObject({
				environmentId: to,
				baseBranch: null,
				baseBranchSource: null,
				linkedPR: null,
			});
		});
	test("environment selection clears branch source and linked PR in one draft update", async () => {
		cloudEnvironments = [
			nativeCloudEnv,
			{ ...nativeCloudEnv, id: "second-env" },
		];
		await cloudMount();
		await React.act(() =>
			draft.getState().updateDraft({
				baseBranch: "feature",
				baseBranchSource: "remote-tracking",
				linkedPR: {
					prNumber: 7,
					title: "Old PR",
					url: gh.url,
					state: "open",
				},
			}),
		);
		await React.act(() =>
			required(environmentProps).onSelectEnvironment("second-env"),
		);
		expect(draft.getState()).toMatchObject({
			environmentId: "second-env",
			baseBranch: null,
			baseBranchSource: null,
			linkedPR: null,
		});
	});
	test("native binding refetch invalidates the selected branch even when environment id is unchanged", async () => {
		await cloudMount();
		await React.act(() =>
			draft.getState().updateDraft({
				baseBranch: "old",
				baseBranchSource: "remote-tracking",
			}),
		);
		cloudEnvironments = [
			{
				...nativeCloudEnv,
				gitlabProject: {
					...nativeCloudProject,
					projectId: "18",
					cloneUrl: "https://git.fixture.invalid/Acme/Team/Other.git",
					pathWithNamespace: "Acme/Team/Other",
				},
			},
		];
		await React.act(async () => {
			await client.refetchQueries();
		});
		await flush();
		expect(draft.getState().baseBranch).toBeNull();
		expect(draft.getState().baseBranchSource).toBeNull();
	});
	test("retained native screen callbacks cannot select for a new organization or after unmount", async () => {
		await cloudMount();
		const selectEnvironment = required(environmentProps).onSelectEnvironment;
		const selectBranch = required(branchArgs).onBaseBranchChange;
		organization = "other-org";
		await mount();
		await flush();
		await React.act(() => {
			selectEnvironment("obsolete");
			selectBranch("obsolete", "remote-tracking");
		});
		expect(draft.getState().environmentId).not.toBe("obsolete");
		expect(draft.getState().baseBranch).not.toBe("obsolete");
		await React.act(() => root?.unmount());
		root = undefined;
		selectEnvironment("unmounted");
		selectBranch("unmounted", "remote-tracking");
		expect(draft.getState().baseBranch).not.toBe("unmounted");
		expect(draft.getState().environmentId).not.toBe("unmounted");
	});
	test("native list refetch or error cannot apply retained branch selection", async () => {
		await cloudMount();
		const selectBranch = required(branchArgs).onBaseBranchChange;
		let release!: () => void;
		cloudBlock = new Promise((resolve) => {
			release = resolve;
		});
		cloudFail = true;
		let pending!: Promise<void>;
		await React.act(async () => {
			pending = client.refetchQueries();
			await new Promise((resolve) => setTimeout(resolve, 5));
		});
		await React.act(() =>
			selectBranch("stale-during-refetch", "remote-tracking"),
		);
		expect(draft.getState().baseBranch).toBeNull();
		await React.act(async () => {
			release();
			await pending;
		});
		await flush();
		await React.act(() =>
			required(branchArgs).onBaseBranchChange(
				"stale-after-error",
				"remote-tracking",
			),
		);
		expect(draft.getState().baseBranch).toBeNull();
	});

	test("native branch Open workspace enters current cloud submit rather than local host create", async () => {
		await cloudMount();
		await React.act(async () => {
			required(branchPickerProps?.onOpenWorkspace)({ branchName: "feature" });
		});
		expect(branchOpens).toEqual([]);
		expect(cloudSubmits).toEqual([
			{
				branch: "feature",
				organizationId: "o",
				environmentId: "native-env",
				project: nativeCloudProject,
			},
		]);
	});
	mock.module("@superset/ui/tabs", () => ({
		Tabs: Box,
		TabsList: Box,
		TabsTrigger: Box,
	}));
	mock.module("renderer/lib/formatRelativeTime", () => ({
		formatRelativeTime: () => "fixture time",
	}));
	mock.module(
		"../DashboardNewWorkspaceForm/PromptGroup/components/FormPickerTrigger",
		() => ({ FormPickerTrigger: Button }),
	);
	const { CompareBaseBranchPicker: ActualBranchPicker } = await import(
		"../DashboardNewWorkspaceForm/PromptGroup/components/CompareBaseBranchPicker/CompareBaseBranchPicker"
	);
	for (const action of ["pointer", "Mod+Enter"])
		test(`actual native branch picker ${action} opens selected cloud branch with its captured binding`, async () => {
			await cloudMount();
			const pickerElement = document.createElement("div");
			document.body.append(pickerElement);
			const pickerRoot = createRoot(pickerElement);
			try {
				await React.act(() =>
					pickerRoot.render(
						<ActualBranchPicker {...required(branchPickerProps)} />,
					),
				);
				if (action === "pointer") {
					const button = required(
						Array.from(pickerElement.querySelectorAll("button")).find((item) =>
							item.textContent?.startsWith("Open workspace"),
						),
					);
					await React.act(() => button.click());
				} else {
					await React.act(() =>
						required(
							pickerElement.querySelector<HTMLButtonElement>(
								"[data-fixture-highlight]",
							),
						).click(),
					);
					await React.act(() =>
						required(
							pickerElement.querySelector("[data-fixture-command]"),
						).dispatchEvent(
							new KeyboardEvent("keydown", {
								key: "Enter",
								metaKey: true,
								bubbles: true,
							}),
						),
					);
				}
				expect(branchOpens).toEqual([]);
				expect(cloudSubmits).toEqual([
					{
						branch: "feature",
						organizationId: "o",
						environmentId: "native-env",
						project: nativeCloudProject,
					},
				]);
			} finally {
				await React.act(() => pickerRoot.unmount());
				pickerElement.remove();
			}
		});
	for (const state of ["error", "loading", "absent-row", "worktree"])
		test(`native branch Open workspace refuses current ${state} target`, async () => {
			await cloudMount();
			branchError = state === "error";
			branchLoading = state === "loading";
			await mount();
			await React.act(() =>
				required(branchPickerProps).onOpenWorkspace({
					branchName: state === "absent-row" ? "absent" : "feature",
					...(state === "worktree" ? { worktreePath: "/tmp/foreign" } : {}),
				}),
			);
			expect(cloudSubmits).toEqual([]);
			expect(branchOpens).toEqual([]);
		});
	test("retained native Open workspace callback cannot act after organization change or unmount", async () => {
		await cloudMount();
		const retained = required(branchPickerProps).onOpenWorkspace;
		organization = "other-org";
		await mount();
		await flush();
		await React.act(() => retained({ branchName: "feature" }));
		expect(cloudSubmits).toEqual([]);
		expect(branchOpens).toEqual([]);
		await React.act(() => root?.unmount());
		root = undefined;
		retained({ branchName: "feature" });
		expect(cloudSubmits).toEqual([]);
		expect(branchOpens).toEqual([]);
	});
	for (const state of ["error", "loading", "absent-row"])
		test(`native branch selection refuses current ${state} snapshot`, async () => {
			await cloudMount();
			branchError = state === "error";
			branchLoading = state === "loading";
			await mount();
			await React.act(() =>
				required(branchArgs).onBaseBranchChange(
					state === "absent-row" ? "absent" : "feature",
					"remote-tracking",
				),
			);
			expect(draft.getState().baseBranch).toBeNull();
		});
	for (const identity of [
		{
			repoProvider: "gitlab",
			repoUrl: "https://git.example.invalid:8443/Group/Sub/Widget",
			icon: null,
		},
		{ repoProvider: "gitlab", repoUrl: null, icon: null },
		{
			repoProvider: null,
			repoUrl: "https://git.example.invalid/Group/Sub/Widget",
			icon: null,
		},
		{
			repoProvider: "github",
			repoUrl: "https://gitlab.com/Group/Widget",
			icon: null,
		},
		{
			repoProvider: "gitlab",
			repoUrl: "https://gitlab.com/Group/Sub/Widget",
			icon: "data:image/png;base64,AAAA",
		},
		{
			repoProvider: "gitlab",
			repoUrl: "https://gitlab.com/Group/Sub/Widget",
			icon: "none",
		},
	])
		test(`native project composer selection is truthful ${identity.repoProvider}:${identity.repoUrl}:${identity.icon}`, async () => {
			hostProjects = [
				{
					projectKey: "native-project",
					name: "Native",
					repoOwner: "Group/Sub",
					repoName: "Widget",
					...identity,
				},
			];
			await mount();
			const picker = required(projectPicker.current);
			expect(picker.projects).toEqual([
				{
					id: "native-project",
					name: "Native",
					githubOwner: null,
					githubRepoName: null,
					iconUrl:
						identity.icon && identity.icon !== "none" ? identity.icon : null,
					needsSetup: true,
				},
			]);
			await React.act(() => picker.onSelectProject("native-project"));
			expect(draft.getState().selectedProjectId).toBe("native-project");
		});
	for (const identity of [
		{
			repoProvider: "github",
			repoUrl: "https://github.com/Acme/Widget",
			icon: null,
		},
		{ repoProvider: undefined, repoUrl: undefined, icon: null },
		{
			repoProvider: "github",
			repoUrl: "https://github.com/Acme/Widget",
			icon: "data:image/png;base64,AAAA",
		},
		{
			repoProvider: "github",
			repoUrl: "https://github.com/Acme/Widget",
			icon: "none",
		},
	])
		test(`genuine and legacy GH composer metadata and icon remain truthful ${identity.repoProvider}:${identity.icon}`, async () => {
			hostProjects = [
				{
					projectKey: "p",
					name: "GitHub",
					repoOwner: "Acme",
					repoName: "Widget",
					...identity,
				},
			];
			await mount();
			expect(required(projectPicker.current).projects).toEqual([
				{
					id: "p",
					name: "GitHub",
					githubOwner: "Acme",
					githubRepoName: "Widget",
					iconUrl:
						identity.icon === "none"
							? null
							: identity.icon || "https://github.com/Acme.png?size=64",
					needsSetup: false,
				},
			]);
		});
}
