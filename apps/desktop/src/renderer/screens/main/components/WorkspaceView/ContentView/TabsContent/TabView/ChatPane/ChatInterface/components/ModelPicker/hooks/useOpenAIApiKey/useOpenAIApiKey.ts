import { chatServiceTrpc } from "@superset/chat/client";
import { useCallback, useEffect, useMemo, useState } from "react";

function getErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error && error.message.trim()) {
		return error.message;
	}
	return fallback;
}

interface UseOpenAIApiKeyParams {
	isModelSelectorOpen: boolean;
	onModelSelectorOpenChange: (open: boolean) => void;
}

interface OpenAIApiKeyDialogState {
	open: boolean;
	apiKey: string;
	errorMessage: string | null;
	isPending: boolean;
	onOpenChange: (open: boolean) => void;
	onApiKeyChange: (value: string) => void;
	onSubmit: () => void;
	onClear: () => void;
}

interface UseOpenAIApiKeyResult {
	isOpenAIAuthenticated: boolean;
	isOpenAIApiKeyConfigured: boolean;
	isSavingOpenAIApiKey: boolean;
	openOpenAIApiKeyDialog: () => void;
	apiKeyDialog: OpenAIApiKeyDialogState;
}

export function useOpenAIApiKey({
	isModelSelectorOpen,
	onModelSelectorOpenChange,
}: UseOpenAIApiKeyParams): UseOpenAIApiKeyResult {
	const [dialogOpen, setDialogOpen] = useState(false);
	const [apiKey, setApiKey] = useState("");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const { data: openAIStatus, refetch: refetchOpenAIStatus } =
		chatServiceTrpc.auth.getOpenAIStatus.useQuery();
	const setOpenAIApiKeyMutation =
		chatServiceTrpc.auth.setOpenAIApiKey.useMutation();
	const clearOpenAIApiKeyMutation =
		chatServiceTrpc.auth.clearOpenAIApiKey.useMutation();
	const isPending =
		setOpenAIApiKeyMutation.isPending || clearOpenAIApiKeyMutation.isPending;

	useEffect(() => {
		if (!isModelSelectorOpen) return;
		void refetchOpenAIStatus();
	}, [isModelSelectorOpen, refetchOpenAIStatus]);

	const openOpenAIApiKeyDialog = useCallback(() => {
		setErrorMessage(null);
		setApiKey("");
		setDialogOpen(true);
	}, []);

	const closeDialog = useCallback(() => {
		setDialogOpen(false);
		setApiKey("");
		setErrorMessage(null);
		onModelSelectorOpenChange(true);
	}, [onModelSelectorOpenChange]);

	const submitApiKey = useCallback(async () => {
		const trimmedApiKey = apiKey.trim();
		if (!trimmedApiKey) {
			setErrorMessage("OpenAI API key is required");
			return;
		}

		setErrorMessage(null);
		try {
			await setOpenAIApiKeyMutation.mutateAsync({ apiKey: trimmedApiKey });
			await refetchOpenAIStatus();
			closeDialog();
		} catch (error) {
			setErrorMessage(getErrorMessage(error, "Failed to save OpenAI API key"));
		}
	}, [apiKey, closeDialog, refetchOpenAIStatus, setOpenAIApiKeyMutation]);

	const clearApiKey = useCallback(async () => {
		setErrorMessage(null);
		try {
			await clearOpenAIApiKeyMutation.mutateAsync();
			await refetchOpenAIStatus();
			closeDialog();
		} catch (error) {
			setErrorMessage(getErrorMessage(error, "Failed to clear OpenAI API key"));
		}
	}, [clearOpenAIApiKeyMutation, closeDialog, refetchOpenAIStatus]);

	const apiKeyDialog = useMemo(
		() => ({
			open: dialogOpen,
			apiKey,
			errorMessage,
			isPending,
			onOpenChange: (open: boolean) => {
				if (!open) {
					closeDialog();
					return;
				}
				openOpenAIApiKeyDialog();
			},
			onApiKeyChange: (value: string) => {
				setApiKey(value);
			},
			onSubmit: () => {
				void submitApiKey();
			},
			onClear: () => {
				void clearApiKey();
			},
		}),
		[
			apiKey,
			clearApiKey,
			closeDialog,
			dialogOpen,
			errorMessage,
			isPending,
			openOpenAIApiKeyDialog,
			submitApiKey,
		],
	);

	return {
		isOpenAIAuthenticated: openAIStatus?.authenticated ?? false,
		isOpenAIApiKeyConfigured: openAIStatus?.method === "api_key",
		isSavingOpenAIApiKey: isPending,
		openOpenAIApiKeyDialog,
		apiKeyDialog,
	};
}
