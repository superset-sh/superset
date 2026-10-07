import {
	mobileM2Fixture,
	runMobileM2Child,
} from "../../../../../hooks/useOpenLink/testFixture.test";
export { runMobileM2Child };
export async function mobileCloudFixture() {
	const f = await mobileM2Fixture();
	const React = f.React;
	f.client.setDefaultOptions({
		queries: { retry: false, retryDelay: 0 },
		mutations: { retry: false },
	});
	const View = ({ children }: { children?: React.ReactNode }) =>
		React.createElement("div", null, children);
	const project = {
		connectionId: "connection-a",
		projectId: "17",
		cloneUrl: "https://git.example/Group/Sub/Repo.git",
		pathWithNamespace: "Group/Sub/Repo",
		defaultBranch: "trunk",
	};
	const nativeEnvironment = {
		id: "environment-a",
		name: "Native",
		organizationId: "org-a",
		repositories: [],
		gitlabProject: project,
	};
	const githubEnvironment = {
		id: "environment-gh",
		name: "GitHub",
		organizationId: "org-a",
		repositories: [{ id: "repo-gh", defaultBranch: "main" }],
		gitlabProject: null,
	};
	const preferences = {
		agentId: "claude",
		targetKey: "cloud:cloud",
		baseBranch: null as string | null,
		environmentId: "environment-a",
		hasHydrated: true,
		setBaseBranch: (value: string | null) => {
			preferences.baseBranch = value;
			emit();
		},
		setEnvironmentId: (value: string) => {
			preferences.environmentId = value;
			preferences.baseBranch = null;
			emit();
		},
	};
	const listeners = new Set<() => void>();
	let version = 0;
	function emit() {
		version++;
		for (const listener of listeners) listener();
	}
	const useStore = (select: (state: typeof preferences) => unknown) => {
		React.useSyncExternalStore(
			(listener) => {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
			() => version,
		);
		return select(preferences);
	};
	Object.assign(useStore, { getState: () => preferences });
	const state = {
		organizationId: "org-a",
		environments: [nativeEnvironment] as unknown[],
		environmentReply: null as unknown,
		projectReply: { items: [project], nextPage: 2 } as unknown,
		branchReply: {
			defaultBranch: "trunk",
			items: [{ name: "trunk" }, { name: "native-feature" }],
			nextPage: 2,
		} as unknown,
		createReply: { id: "workspace-new" } as unknown,
		environmentCreateReply: {
			id: "environment-new",
			name: project.pathWithNamespace,
		} as unknown,
		uploads: null as Promise<string[]> | null,
		composer: null as Record<string, unknown> | null,
		presses: [] as Record<string, unknown>[],
		inputs: [] as Record<string, unknown>[],
		requests: [] as { method: string; input: unknown }[],
		pushes: [] as unknown[],
		backs: 0,
		clears: 0,
		alerts: [] as unknown[],
		reviewCreates: 0,
		params: { machineId: "cloud", projectId: "cloud" } as Record<
			string,
			string
		>,
		scope: "cloud",
	};
	const resolve = async (value: unknown) => {
		if (value instanceof Error) throw value;
		return value;
	};
	const request = async (method: string, input: unknown, reply: unknown) => {
		state.requests.push({ method, input });
		return resolve(reply);
	};
	const apiClient = {
		environment: {
			list: {
				query: (input: unknown) =>
					request(
						"environments",
						input,
						state.environmentReply ?? state.environments,
					),
			},
			create: {
				mutate: (input: unknown) =>
					request("environment-create", input, state.environmentCreateReply),
			},
		},
		cloudWorkspace: {
			listGitlabProjects: {
				query: (input: unknown) =>
					request("native-projects", input, state.projectReply),
			},
			listGitlabBranches: {
				query: (input: unknown) =>
					request("native-branches", input, state.branchReply),
			},
			listBranches: {
				query: (input: unknown) =>
					request("GH-branches", input, {
						defaultBranch: "main",
						items: [{ name: "main" }, { name: "GH-feature" }],
					}),
			},
			create: {
				mutate: (input: unknown) =>
					request("workspace-create", input, state.createReply),
			},
		},
	};
	const i18n = { _: ({ message }: { message: string }) => message };
	f.mockLeaf("@lingui/react/macro", {
		useLingui: () => ({
			i18n,
			t: ({ message }: { message: string }) => message,
		}),
		Trans: View,
	});
	f.mockLeaf("@superset/i18n", { i18n });
	f.mockLeaf("@/lib/auth/client", {
		useSession: () => ({
			data: { session: { activeOrganizationId: state.organizationId } },
		}),
	});
	f.mockLeaf("@/lib/trpc/client", { apiClient });
	f.mockLeaf("@/lib/errors", {
		errorCopy: (e: Error) => e.message,
		transportFailureKind: () => null,
	});
	f.mockLeaf("@/lib/posthog", {
		posthog: { capture: () => {} },
		useFeatureFlag: () => true,
	});
	f.mockLeaf(
		"@/screens/(authenticated)/(home)/home/components/NewChatWidget/stores/newSessionPreferencesStore",
		{ useNewSessionPreferencesStore: useStore },
	);
	f.mockLeaf("react-native", {
		View,
		ScrollView: View,
		Pressable: (props: Record<string, unknown>) => {
			state.presses.push(props);
			return React.createElement(View, props);
		},
		Alert: { alert: (...args: unknown[]) => state.alerts.push(args) },
	});
	f.mockLeaf("@/components/ui/button", {
		Button: (props: Record<string, unknown>) => {
			state.presses.push(props);
			return React.createElement(View, props);
		},
	});
	f.mockLeaf("@/components/ui/input", {
		Input: (props: Record<string, unknown>) => {
			state.inputs.push(props);
			return null;
		},
	});
	f.mockLeaf("@/components/ui/spinner", {
		Spinner: () => React.createElement(View, null, "Owned spinner"),
	});
	f.mockLeaf("@expo/vector-icons/Ionicons", { default: () => null });
	f.mockLeaf("lucide-react-native", { Layers: () => null });
	f.mockLeaf("react-native-safe-area-context", {
		useSafeAreaInsets: () => ({ bottom: 0 }),
	});
	f.mockLeaf("@/hooks/useTheme", {
		useTheme: () => ({
			foreground: "white",
			mutedForeground: "gray",
			primary: "blue",
		}),
	});
	const router = {
		push: (value: unknown) => state.pushes.push(value),
		back: () => state.backs++,
	};
	const Stack = Object.assign(View, {
		Screen: () => null,
		Toolbar: Object.assign(View, { Button: () => null }),
	});
	f.mockLeaf("expo-router", {
		Stack,
		useRouter: () => router,
		useLocalSearchParams: () => state.params,
	});
	f.mockLeaf("@/hooks/useOrgHosts", {
		useOrgHosts: () => ({ query: { data: [], isPending: false } }),
	});
	f.mockLeaf("@/lib/host-service/client", {
		hostServiceUrl: () => "https://host.example",
		getHostServiceClientByUrl: () => ({
			workspaceCreation: {
				searchBranches: {
					query: (input: unknown) =>
						request("host-branches", input, {
							defaultBranch: "main",
							items: [],
						}),
				},
			},
		}),
	});
	f.mockLeaf("@/hooks/useCloudWorkspaces", {
		getCloudWorkspacesQueryKey: (org: string) => ["cloud", "workspaces", org],
	});
	f.mockLeaf("@/screens/(authenticated)/stores/appReviewStore", {
		useAppReviewStore: {
			getState: () => ({ recordWorkspaceCreated: () => state.reviewCreates++ }),
		},
	});
	const selection = await import("./useCloudCreateSelection");
	f.mockLeaf(
		"@/screens/(authenticated)/(home)/hooks/useCloudCreateSelection",
		selection,
	);
	f.mockLeaf(
		"@/screens/(authenticated)/(home)/hooks/useCloudCreateSelection/useCloudCreateSelection",
		selection,
	);
	f.mockLeaf(
		"@/hooks/useCloudEnvironments/useCloudEnvironments",
		await import("@/hooks/useCloudEnvironments/useCloudEnvironments"),
	);
	const create = await import(
		"../../home/components/NewChatWidget/hooks/useCreateCloudWorkspace/useCreateCloudWorkspace"
	);
	async function load(relative: string) {
		return f.loadConsumer(new URL(relative, import.meta.url));
	}
	async function branch() {
		f.mockLeaf(
			"@/screens/(authenticated)/(home)/home/components/NewChatWidget/hooks/useNewChatTargets",
			{ CLOUD_TARGET_ID: "cloud" },
		);
		return load("../../new-session/branch/BranchPickerScreen.tsx");
	}
	async function environment() {
		const consumer = new URL(
			"../../new-session/environment/EnvironmentPickerScreen.tsx",
			import.meta.url,
		);
		const native = new URL(
			"../../new-session/environment/components/GitlabEnvironmentProjects/GitlabEnvironmentProjects.tsx",
			import.meta.url,
		);
		const fs = await import("node:fs");
		if (fs.existsSync(native)) {
			const module = await f.loadConsumer(native);
			f.mockLeaf("./components/GitlabEnvironmentProjects", module, consumer);
		}
		return f.loadConsumer(consumer);
	}
	async function widget() {
		f.mockLeaf("@superset/i18n/errors", {
			errorMessage: (error: Error) => error.message,
		});
		f.mockLeaf(
			"@superset/shared/cloud-agent-launch",
			await import("@superset/shared/cloud-agent-launch"),
		);
		f.mockLeaf(
			"@superset/shared/host-agent-presets",
			await import("@superset/shared/host-agent-presets"),
		);
		const consumer = new URL(
			"../../home/components/NewChatWidget/NewChatWidget.tsx",
			import.meta.url,
		);
		f.mockLeaf("@superset/composer", {
			Composer: React.forwardRef(
				(props: Record<string, unknown>, ref: React.Ref<unknown>) => {
					state.composer = props;
					React.useImperativeHandle(ref, () => ({
						clear: () => state.clears++,
						focus: () => {},
					}));
					return null;
				},
			),
		});
		f.mockLeaf("expo-haptics", {
			impactAsync: () => {},
			ImpactFeedbackStyle: { Light: "light" },
		});
		f.mockLeaf("@/lib/attachments/upload", {
			awaitAttachmentUploads: () => state.uploads ?? Promise.resolve([]),
		});
		f.mockLeaf("@/screens/(authenticated)/(home)/hooks/useWorkspaceScope", {
			useWorkspaceScope: () => state.scope,
		});
		f.mockLeaf("@/screens/(authenticated)/hooks/useComposerDraft", {
			useComposerDraft: () => ({
				readText: () => "",
				attachments: [],
				clear: () => state.clears++,
				setText: () => {},
				remove: () => {},
			}),
		});
		for (const [id, name, value] of [
			["useAttachmentsSheet", "useAttachmentsSheet", () => {}],
			["usePasteAttachments", "usePasteAttachments", () => {}],
			["useAttachmentUploads", "useAttachmentUploads", {}],
			["useHostAgentConfigs", "useHostAgentConfigs", { data: [] }],
			[
				"useCreateTerminalWorkspace",
				"useCreateTerminalWorkspace",
				{ isPending: false, mutateAsync: async () => {} },
			],
		] as const)
			f.mockLeaf(`@/screens/(authenticated)/hooks/${id}`, {
				[name]: () => value,
			});
		f.mockLeaf("@/screens/(authenticated)/hooks/useAgentLaunchPreferences", {
			agentLaunchPresetId: () => "claude",
			useAgentLaunchPreferences: () => ({ efforts: [], models: undefined }),
		});
		f.mockLeaf("@/screens/(authenticated)/stores/composerDraftsStore", {
			HOME_DRAFT_KEY: "home",
		});
		f.mockLeaf(
			"../../stores/composerFocusStore",
			{ useComposerFocusStore: () => 0 },
			consumer,
		);
		f.mockLeaf(
			"./hooks/useAgentIconUri",
			{ useAgentIconUri: () => null },
			consumer,
		);
		const target = {
			key: "cloud:cloud",
			kind: "cloud",
			projectId: "cloud",
			projectName: "Cloud",
			machineId: "cloud",
			hostUrl: "",
		};
		f.mockLeaf(
			"./hooks/useNewChatTargets",
			{
				useNewChatTargets: () => ({ targets: [target], defaultTarget: target }),
			},
			consumer,
		);
		f.mockLeaf("./hooks/useCreateCloudWorkspace", create, consumer);
		f.mockLeaf(
			"./stores/newSessionPreferencesStore",
			{ useNewSessionPreferencesStore: useStore },
			consumer,
		);
		return f.loadConsumer(consumer);
	}
	function reset() {
		state.organizationId = "org-a";
		state.environments = [nativeEnvironment];
		state.environmentReply = null;
		state.projectReply = { items: [project], nextPage: 2 };
		state.branchReply = {
			defaultBranch: "trunk",
			items: [{ name: "trunk" }, { name: "native-feature" }],
			nextPage: 2,
		};
		state.createReply = { id: "workspace-new" };
		state.environmentCreateReply = {
			id: "environment-new",
			name: project.pathWithNamespace,
		};
		state.uploads = null;
		state.composer = null;
		state.presses = [];
		state.inputs = [];
		state.requests = [];
		state.pushes = [];
		state.backs = 0;
		state.clears = 0;
		state.alerts = [];
		state.reviewCreates = 0;
		state.params = { machineId: "cloud", projectId: "cloud" };
		state.scope = "cloud";
		preferences.environmentId = "environment-a";
		preferences.baseBranch = null;
	}
	return {
		...f,
		reset,
		state,
		preferences,
		project,
		nativeEnvironment,
		githubEnvironment,
		selection,
		create,
		branch,
		environment,
		widget,
		emit,
		render: async (Component: React.ComponentType) => {
			state.presses = [];
			state.inputs = [];
			await f.render(Component);
		},
		cleanup: () => f.cleanup(),
	};
}
