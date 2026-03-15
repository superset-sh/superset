import { toast } from "@superset/ui/sonner";
import {
	createContext,
	type PropsWithChildren,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";

export type V2NewWorkspaceModalTab =
	| "prompt"
	| "issues"
	| "pull-requests"
	| "branches";

export interface V2NewWorkspaceModalDraft {
	activeTab: V2NewWorkspaceModalTab;
	selectedProjectId: string | null;
	selectedDeviceId: string | null;
	prompt: string;
	branchName: string;
	branchNameEdited: boolean;
	baseBranch: string | null;
	showAdvanced: boolean;
	branchSearch: string;
	issuesQuery: string;
	pullRequestsQuery: string;
	branchesQuery: string;
}

interface V2NewWorkspaceModalDraftState extends V2NewWorkspaceModalDraft {
	draftVersion: number;
}

const initialDraft: V2NewWorkspaceModalDraft = {
	activeTab: "prompt",
	selectedProjectId: null,
	selectedDeviceId: null,
	prompt: "",
	branchName: "",
	branchNameEdited: false,
	baseBranch: null,
	showAdvanced: false,
	branchSearch: "",
	issuesQuery: "",
	pullRequestsQuery: "",
	branchesQuery: "",
};

function buildInitialDraftState(): V2NewWorkspaceModalDraftState {
	return {
		...initialDraft,
		draftVersion: 0,
	};
}

interface V2NewWorkspaceModalActionMessages {
	loading: string;
	success: string;
	error: (err: unknown) => string;
}

interface V2NewWorkspaceModalDraftContextValue {
	draft: V2NewWorkspaceModalDraft;
	draftVersion: number;
	closeModal: () => void;
	closeAndResetDraft: () => void;
	runAsyncAction: <T>(
		promise: Promise<T>,
		messages: V2NewWorkspaceModalActionMessages,
	) => Promise<T>;
	updateDraft: (patch: Partial<V2NewWorkspaceModalDraft>) => void;
	resetDraft: () => void;
	resetDraftIfVersion: (draftVersion: number) => void;
}

const V2NewWorkspaceModalDraftContext =
	createContext<V2NewWorkspaceModalDraftContextValue | null>(null);

export function V2NewWorkspaceModalDraftProvider({
	children,
	onClose,
}: PropsWithChildren<{ onClose: () => void }>) {
	const [state, setState] = useState(buildInitialDraftState);

	const updateDraft = useCallback(
		(patch: Partial<V2NewWorkspaceModalDraft>) => {
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
		}));
	}, []);

	const resetDraftIfVersion = useCallback((draftVersion: number) => {
		setState((state) =>
			state.draftVersion !== draftVersion
				? state
				: {
						...initialDraft,
						draftVersion: state.draftVersion + 1,
					},
		);
	}, []);

	const closeAndResetDraft = useCallback(() => {
		resetDraft();
		onClose();
	}, [onClose, resetDraft]);

	const runAsyncAction = useCallback(
		<T,>(promise: Promise<T>, messages: V2NewWorkspaceModalActionMessages) => {
			const submitDraftVersion = state.draftVersion;
			onClose();
			toast.promise(promise, {
				loading: messages.loading,
				success: messages.success,
				error: (err) => messages.error(err),
			});
			void promise
				.then(() => {
					resetDraftIfVersion(submitDraftVersion);
				})
				.catch(() => undefined);
			return promise;
		},
		[onClose, resetDraftIfVersion, state.draftVersion],
	);

	const value = useMemo<V2NewWorkspaceModalDraftContextValue>(
		() => ({
			draft: {
				activeTab: state.activeTab,
				selectedProjectId: state.selectedProjectId,
				selectedDeviceId: state.selectedDeviceId,
				prompt: state.prompt,
				branchName: state.branchName,
				branchNameEdited: state.branchNameEdited,
				baseBranch: state.baseBranch,
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
			resetDraftIfVersion,
		}),
		[
			closeAndResetDraft,
			onClose,
			resetDraft,
			resetDraftIfVersion,
			runAsyncAction,
			state,
			updateDraft,
		],
	);

	return (
		<V2NewWorkspaceModalDraftContext.Provider value={value}>
			{children}
		</V2NewWorkspaceModalDraftContext.Provider>
	);
}

export function useV2NewWorkspaceModalDraft() {
	const context = useContext(V2NewWorkspaceModalDraftContext);
	if (!context) {
		throw new Error(
			"useV2NewWorkspaceModalDraft must be used within V2NewWorkspaceModalDraftProvider",
		);
	}
	return context;
}
