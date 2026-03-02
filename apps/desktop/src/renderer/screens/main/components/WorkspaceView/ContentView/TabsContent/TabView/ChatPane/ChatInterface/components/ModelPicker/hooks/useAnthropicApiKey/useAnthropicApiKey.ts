import { chatServiceTrpc } from "@superset/chat/client";
import { useCallback, useEffect, useMemo, useState } from "react";

function getErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error && error.message.trim()) {
		return error.message;
	}
	return fallback;
}

interface UseAnthropicApiKeyParams {
	isModelSelectorOpen: boolean;
	onModelSelectorOpenChange: (open: boolean) => void;
}

interface AnthropicApiKeyDialogState {
	open: boolean;
	apiKey: string;
	errorMessage: string | null;
	isPending: boolean;
	onOpenChange: (open: boolean) => void;
	onApiKeyChange: (value: string) => void;
	onSubmit: () => void;
	onClear: () => void;
}

interface UseAnthropicApiKeyResult {
	isAnthropicAuthenticated: boolean;
	isAnthropicApiKeyConfigured: boolean;
	isSavingAnthropicApiKey: boolean;
	openAnthropicApiKeyDialog: () => void;
	apiKeyDialog: AnthropicApiKeyDialogState;
}

export function useAnthropicApiKey({
	isModelSelectorOpen,
	onModelSelectorOpenChange,
}: UseAnthropicApiKeyParams): UseAnthropicApiKeyResult {
	const [dialogOpen, setDialogOpen] = useState(false);
	const [apiKey, setApiKey] = useState("");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const { data: anthropicStatus, refetch: refetchAnthropicStatus } =
		chatServiceTrpc.auth.getAnthropicStatus.useQuery();
	const setAnthropicApiKeyMutation =
		chatServiceTrpc.auth.setAnthropicApiKey.useMutation();
	const clearAnthropicApiKeyMutation =
		chatServiceTrpc.auth.clearAnthropicApiKey.useMutation();
	const isPending =
		setAnthropicApiKeyMutation.isPending ||
		clearAnthropicApiKeyMutation.isPending;

	useEffect(() => {
		if (!isModelSelectorOpen) return;
		void refetchAnthropicStatus();
	}, [isModelSelectorOpen, refetchAnthropicStatus]);

	const openAnthropicApiKeyDialog = useCallback(() => {
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
			setErrorMessage("Anthropic API key is required");
			return;
		}

		setErrorMessage(null);
		try {
			await setAnthropicApiKeyMutation.mutateAsync({ apiKey: trimmedApiKey });
			await refetchAnthropicStatus();
			closeDialog();
		} catch (error) {
			setErrorMessage(
				getErrorMessage(error, "Failed to save Anthropic API key"),
			);
		}
	}, [apiKey, closeDialog, refetchAnthropicStatus, setAnthropicApiKeyMutation]);

	const clearApiKey = useCallback(async () => {
		setErrorMessage(null);
		try {
			await clearAnthropicApiKeyMutation.mutateAsync();
			await refetchAnthropicStatus();
			closeDialog();
		} catch (error) {
			setErrorMessage(
				getErrorMessage(error, "Failed to clear Anthropic API key"),
			);
		}
	}, [clearAnthropicApiKeyMutation, closeDialog, refetchAnthropicStatus]);

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
				openAnthropicApiKeyDialog();
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
			openAnthropicApiKeyDialog,
			submitApiKey,
		],
	);

	return {
		isAnthropicAuthenticated: anthropicStatus?.authenticated ?? false,
		isAnthropicApiKeyConfigured: anthropicStatus?.method === "api_key",
		isSavingAnthropicApiKey: isPending,
		openAnthropicApiKeyDialog,
		apiKeyDialog,
	};
}
