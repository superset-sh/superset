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
	envText: string;
	errorMessage: string | null;
	isPending: boolean;
	onOpenChange: (open: boolean) => void;
	onEnvTextChange: (value: string) => void;
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
	const [envText, setEnvText] = useState("");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const { data: anthropicStatus, refetch: refetchAnthropicStatus } =
		chatServiceTrpc.auth.getAnthropicStatus.useQuery();
	const { data: anthropicEnvConfig, refetch: refetchAnthropicEnvConfig } =
		chatServiceTrpc.auth.getAnthropicEnvConfig.useQuery();
	const setAnthropicApiKeyMutation =
		chatServiceTrpc.auth.setAnthropicEnvConfig.useMutation();
	const clearAnthropicEnvConfigMutation =
		chatServiceTrpc.auth.clearAnthropicEnvConfig.useMutation();
	const isPending =
		setAnthropicApiKeyMutation.isPending ||
		clearAnthropicEnvConfigMutation.isPending;

	useEffect(() => {
		if (!isModelSelectorOpen) return;
		void refetchAnthropicStatus();
		void refetchAnthropicEnvConfig();
	}, [isModelSelectorOpen, refetchAnthropicEnvConfig, refetchAnthropicStatus]);

	const openAnthropicApiKeyDialog = useCallback(() => {
		setErrorMessage(null);
		setEnvText(anthropicEnvConfig?.envText ?? "");
		setDialogOpen(true);
	}, [anthropicEnvConfig?.envText]);

	const closeDialog = useCallback(() => {
		setDialogOpen(false);
		setEnvText("");
		setErrorMessage(null);
		onModelSelectorOpenChange(true);
	}, [onModelSelectorOpenChange]);

	const submitApiKey = useCallback(async () => {
		setErrorMessage(null);
		try {
			await setAnthropicApiKeyMutation.mutateAsync({ envText });
			await Promise.all([
				refetchAnthropicStatus(),
				refetchAnthropicEnvConfig(),
			]);
			closeDialog();
		} catch (error) {
			setErrorMessage(
				getErrorMessage(error, "Failed to save Anthropic settings"),
			);
		}
	}, [
		closeDialog,
		envText,
		refetchAnthropicEnvConfig,
		refetchAnthropicStatus,
		setAnthropicApiKeyMutation,
	]);

	const clearApiKey = useCallback(async () => {
		setErrorMessage(null);
		try {
			await clearAnthropicEnvConfigMutation.mutateAsync();
			await Promise.all([
				refetchAnthropicStatus(),
				refetchAnthropicEnvConfig(),
			]);
			closeDialog();
		} catch (error) {
			setErrorMessage(
				getErrorMessage(error, "Failed to clear Anthropic settings"),
			);
		}
	}, [
		clearAnthropicEnvConfigMutation,
		closeDialog,
		refetchAnthropicEnvConfig,
		refetchAnthropicStatus,
	]);

	const apiKeyDialog = useMemo(
		() => ({
			open: dialogOpen,
			envText,
			errorMessage,
			isPending,
			onOpenChange: (open: boolean) => {
				if (!open) {
					closeDialog();
					return;
				}
				openAnthropicApiKeyDialog();
			},
			onEnvTextChange: (value: string) => {
				setEnvText(value);
			},
			onSubmit: () => {
				void submitApiKey();
			},
			onClear: () => {
				void clearApiKey();
			},
		}),
		[
			envText,
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
		isAnthropicApiKeyConfigured:
			anthropicStatus?.method === "api_key" ||
			anthropicStatus?.method === "env",
		isSavingAnthropicApiKey: isPending,
		openAnthropicApiKeyDialog,
		apiKeyDialog,
	};
}
