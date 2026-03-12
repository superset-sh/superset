import { toast } from "@superset/ui/sonner";
import {
	createContext,
	type PropsWithChildren,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";

export type LinkedIssue = {
	slug: string;
	title: string;
};

export interface NewWorkspaceModalDraft {
	selectedProjectId: string | null;
	prompt: string;
	baseBranch: string | null;
	runSetupScript: boolean;
	workspaceName: string;
	workspaceNameEdited: boolean;
	linkedIssues: LinkedIssue[];
}

interface NewWorkspaceModalDraftState extends NewWorkspaceModalDraft {
	draftVersion: number;
}

const initialDraft: NewWorkspaceModalDraft = {
	selectedProjectId: null,
	prompt: "",
	baseBranch: null,
	runSetupScript: true,
	workspaceName: "",
	workspaceNameEdited: false,
	linkedIssues: [],
};

function buildInitialDraftState(): NewWorkspaceModalDraftState {
	return {
		...initialDraft,
		draftVersion: 0,
	};
}

interface NewWorkspaceModalActionMessages {
	loading: string;
	success: string;
	error: (err: unknown) => string;
}

interface NewWorkspaceModalDraftContextValue {
	draft: NewWorkspaceModalDraft;
	draftVersion: number;
	closeModal: () => void;
	closeAndResetDraft: () => void;
	runAsyncAction: <T>(
		promise: Promise<T>,
		messages: NewWorkspaceModalActionMessages,
	) => Promise<T>;
	updateDraft: (patch: Partial<NewWorkspaceModalDraft>) => void;
	resetDraft: () => void;
	resetDraftIfVersion: (draftVersion: number) => void;
}

const NewWorkspaceModalDraftContext =
	createContext<NewWorkspaceModalDraftContextValue | null>(null);

export function NewWorkspaceModalDraftProvider({
	children,
	onClose,
}: PropsWithChildren<{ onClose: () => void }>) {
	const [state, setState] = useState(buildInitialDraftState);

	const updateDraft = useCallback((patch: Partial<NewWorkspaceModalDraft>) => {
		setState((state) => ({
			...state,
			...patch,
			draftVersion: state.draftVersion + 1,
		}));
	}, []);

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
		<T,>(promise: Promise<T>, messages: NewWorkspaceModalActionMessages) => {
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

	const value = useMemo<NewWorkspaceModalDraftContextValue>(
		() => ({
			draft: {
				selectedProjectId: state.selectedProjectId,
				prompt: state.prompt,
				baseBranch: state.baseBranch,
				runSetupScript: state.runSetupScript,
				workspaceName: state.workspaceName,
				workspaceNameEdited: state.workspaceNameEdited,
				linkedIssues: state.linkedIssues,
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
		<NewWorkspaceModalDraftContext.Provider value={value}>
			{children}
		</NewWorkspaceModalDraftContext.Provider>
	);
}

export function useNewWorkspaceModalDraft() {
	const context = useContext(NewWorkspaceModalDraftContext);
	if (!context) {
		throw new Error(
			"useNewWorkspaceModalDraft must be used within NewWorkspaceModalDraftProvider",
		);
	}
	return context;
}
