import { toast } from "@superset/ui/sonner";
import {
	createContext,
	type PropsWithChildren,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import type { WorkspaceHostTarget } from "./components/DashboardNewWorkspaceForm/components/DevicePicker";
import { useCreateDashboardWorkspace } from "./hooks/useCreateDashboardWorkspace";

export type LinkedIssue = {
	slug: string; // "#123" for GitHub, "SUP-123" for internal
	title: string;
	source?: "github" | "internal";
	url?: string; // GitHub issue URL
	taskId?: string; // Internal task ID for navigation
	number?: number; // GitHub issue number
	state?: "open" | "closed";
};

export type LinkedPR = {
	prNumber: number;
	title: string;
	url: string;
	state: string;
};

export interface DashboardNewWorkspaceDraft {
	selectedProjectId: string | null;
	hostTarget: WorkspaceHostTarget;
	prompt: string;
	baseBranch: string | null;
	runSetupScript: boolean;
	workspaceName: string;
	workspaceNameEdited: boolean;
	branchName: string;
	branchNameEdited: boolean;
	linkedIssues: LinkedIssue[];
	linkedPR: LinkedPR | null;
}

interface DashboardNewWorkspaceDraftState extends DashboardNewWorkspaceDraft {
	draftVersion: number;
	resetKey: number;
}

const initialDraft: DashboardNewWorkspaceDraft = {
	selectedProjectId: null,
	hostTarget: { kind: "local" },
	prompt: "",
	baseBranch: null,
	runSetupScript: true,
	workspaceName: "",
	workspaceNameEdited: false,
	branchName: "",
	branchNameEdited: false,
	linkedIssues: [],
	linkedPR: null,
};

function buildInitialDraftState(): DashboardNewWorkspaceDraftState {
	return {
		...initialDraft,
		draftVersion: 0,
		resetKey: 0,
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
	resetKey: number;
	closeModal: () => void;
	closeAndResetDraft: () => void;
	createWorkspace: ReturnType<typeof useCreateDashboardWorkspace>;
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

	// Owned here so onSuccess survives Dialog unmounting content on close.
	const createWorkspace = useCreateDashboardWorkspace();

	const updateDraft = useCallback(
		(patch: Partial<DashboardNewWorkspaceDraft>) => {
			setState((state) => ({
				...state,
				...patch,
				draftVersion: state.draftVersion + 1,
			}));
		},
		[],
	);

	const resetDraft = useCallback(() => {
		setState((state) => ({
			...initialDraft,
			draftVersion: state.draftVersion + 1,
			resetKey: state.resetKey + 1,
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
				selectedProjectId: state.selectedProjectId,
				hostTarget: state.hostTarget,
				prompt: state.prompt,
				baseBranch: state.baseBranch,
				runSetupScript: state.runSetupScript,
				workspaceName: state.workspaceName,
				workspaceNameEdited: state.workspaceNameEdited,
				branchName: state.branchName,
				branchNameEdited: state.branchNameEdited,
				linkedIssues: state.linkedIssues,
				linkedPR: state.linkedPR,
			},
			draftVersion: state.draftVersion,
			resetKey: state.resetKey,
			closeModal: onClose,
			closeAndResetDraft,
			createWorkspace,
			runAsyncAction,
			updateDraft,
			resetDraft,
		}),
		[
			closeAndResetDraft,
			createWorkspace,
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
