import { toast } from "@superset/ui/sonner";
import {
	createContext,
	type PropsWithChildren,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import type { WorkspaceHostTarget } from "renderer/lib/v2-workspace-host";

export type DashboardNewWorkspaceTab =
	| "prompt"
	| "issues"
	| "pull-requests"
	| "branches";

export interface DashboardNewWorkspaceDraft {
	activeTab: DashboardNewWorkspaceTab;
	selectedProjectId: string | null;
	hostTarget: WorkspaceHostTarget;
	prompt: string;
	branchName: string;
	branchNameEdited: boolean;
	compareBaseBranch: string | null;
	showAdvanced: boolean;
	branchSearch: string;
	issuesQuery: string;
	pullRequestsQuery: string;
	branchesQuery: string;
}

interface DashboardNewWorkspaceDraftState extends DashboardNewWorkspaceDraft {
	draftVersion: number;
}

const initialDraft: DashboardNewWorkspaceDraft = {
	activeTab: "prompt",
	selectedProjectId: null,
	hostTarget: { kind: "local" },
	prompt: "",
	branchName: "",
	branchNameEdited: false,
	compareBaseBranch: null,
	showAdvanced: false,
	branchSearch: "",
	issuesQuery: "",
	pullRequestsQuery: "",
	branchesQuery: "",
};

function buildInitialDraftState(): DashboardNewWorkspaceDraftState {
	return {
		...initialDraft,
		draftVersion: 0,
	};
}

interface DashboardNewWorkspaceActionMessages {
	loading: string;
	success: string;
	error: (err: unknown) => string;
}

interface DashboardNewWorkspaceActionOptions {
	closeAndReset?: boolean;
}

interface DashboardNewWorkspaceDraftContextValue {
	draft: DashboardNewWorkspaceDraft;
	draftVersion: number;
	closeModal: () => void;
	closeAndResetDraft: () => void;
	runAsyncAction: <T>(
		promise: Promise<T>,
		messages: DashboardNewWorkspaceActionMessages,
		options?: DashboardNewWorkspaceActionOptions,
	) => Promise<T>;
	updateDraft: (patch: Partial<DashboardNewWorkspaceDraft>) => void;
	resetDraft: () => void;
}

const DashboardNewWorkspaceDraftContext =
	createContext<DashboardNewWorkspaceDraftContextValue | null>(null);

export function DashboardNewWorkspaceDraftProvider({
	children,
	onClose,
}: PropsWithChildren<{ onClose: () => void }>) {
	const [state, setState] = useState(buildInitialDraftState);

	const updateDraft = useCallback(
		(patch: Partial<DashboardNewWorkspaceDraft>) => {
			setState((state) => {
				const entries = Object.entries(patch) as Array<
					[
						keyof DashboardNewWorkspaceDraft,
						DashboardNewWorkspaceDraft[keyof DashboardNewWorkspaceDraft],
					]
				>;
				const hasChanges = entries.some(([key, value]) => state[key] !== value);
				if (!hasChanges) {
					return state;
				}

				return {
					...state,
					...patch,
					draftVersion: state.draftVersion + 1,
				};
			});
		},
		[],
	);

	const resetDraft = useCallback(() => {
		setState((state) => ({
			...initialDraft,
			draftVersion: state.draftVersion + 1,
		}));
	}, []);

	const closeAndResetDraft = useCallback(() => {
		resetDraft();
		onClose();
	}, [onClose, resetDraft]);

	const runAsyncAction = useCallback(
		<T,>(
			promise: Promise<T>,
			messages: DashboardNewWorkspaceActionMessages,
			options?: DashboardNewWorkspaceActionOptions,
		) => {
			if (options?.closeAndReset !== false) {
				onClose();
				resetDraft();
			}
			toast.promise(promise, {
				loading: messages.loading,
				success: messages.success,
				error: (err) => messages.error(err),
			});
			return promise;
		},
		[onClose, resetDraft],
	);

	const value = useMemo<DashboardNewWorkspaceDraftContextValue>(
		() => ({
			draft: {
				activeTab: state.activeTab,
				selectedProjectId: state.selectedProjectId,
				hostTarget: state.hostTarget,
				prompt: state.prompt,
				branchName: state.branchName,
				branchNameEdited: state.branchNameEdited,
				compareBaseBranch: state.compareBaseBranch,
				showAdvanced: state.showAdvanced,
				branchSearch: state.branchSearch,
				issuesQuery: state.issuesQuery,
				pullRequestsQuery: state.pullRequestsQuery,
				branchesQuery: state.branchesQuery,
			},
			draftVersion: state.draftVersion,
			closeModal: onClose,
			closeAndResetDraft,
			runAsyncAction,
			updateDraft,
			resetDraft,
		}),
		[
			closeAndResetDraft,
			onClose,
			resetDraft,
			runAsyncAction,
			state,
			updateDraft,
		],
	);

	return (
		<DashboardNewWorkspaceDraftContext.Provider value={value}>
			{children}
		</DashboardNewWorkspaceDraftContext.Provider>
	);
}

export function useDashboardNewWorkspaceDraft() {
	const context = useContext(DashboardNewWorkspaceDraftContext);
	if (!context) {
		throw new Error(
			"useDashboardNewWorkspaceDraft must be used within DashboardNewWorkspaceDraftProvider",
		);
	}
	return context;
}
