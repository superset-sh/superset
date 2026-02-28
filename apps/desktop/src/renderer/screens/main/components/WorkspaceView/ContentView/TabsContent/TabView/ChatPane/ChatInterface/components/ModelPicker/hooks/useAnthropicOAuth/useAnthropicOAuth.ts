import { chatServiceTrpc } from "@superset/chat/client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";

function getErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error && error.message.trim()) {
		return error.message;
	}
	return fallback;
}

interface UseAnthropicOAuthParams {
	isModelSelectorOpen: boolean;
	onModelSelectorOpenChange: (open: boolean) => void;
}

interface AnthropicOAuthDialogState {
	open: boolean;
	authUrl: string | null;
	code: string;
	errorMessage: string | null;
	isPending: boolean;
	onOpenChange: (open: boolean) => void;
	onCodeChange: (value: string) => void;
	onOpenAuthUrl: () => void;
	onCopyAuthUrl: () => void;
	onSubmit: () => void;
}

interface UseAnthropicOAuthResult {
	isAnthropicAuthenticated: boolean;
	isStartingOAuth: boolean;
	startAnthropicOAuth: () => Promise<void>;
	oauthDialog: AnthropicOAuthDialogState;
}

export function useAnthropicOAuth({
	isModelSelectorOpen,
	onModelSelectorOpenChange,
}: UseAnthropicOAuthParams): UseAnthropicOAuthResult {
	const [oauthDialogOpen, setOauthDialogOpen] = useState(false);
	const [oauthUrl, setOauthUrl] = useState<string | null>(null);
	const [oauthCode, setOauthCode] = useState("");
	const [oauthError, setOauthError] = useState<string | null>(null);
	const [hasPendingOAuthSession, setHasPendingOAuthSession] = useState(false);

	const { data: anthropicStatus, refetch: refetchAnthropicStatus } =
		chatServiceTrpc.auth.getAnthropicStatus.useQuery();
	const startAnthropicOAuthMutation =
		chatServiceTrpc.auth.startAnthropicOAuth.useMutation();
	const completeAnthropicOAuthMutation =
		chatServiceTrpc.auth.completeAnthropicOAuth.useMutation();
	const cancelAnthropicOAuthMutation =
		chatServiceTrpc.auth.cancelAnthropicOAuth.useMutation();

	useEffect(() => {
		if (!isModelSelectorOpen) return;
		void refetchAnthropicStatus();
	}, [isModelSelectorOpen, refetchAnthropicStatus]);

	const openExternalUrl = useCallback(async (url: string) => {
		try {
			await electronTrpcClient.external.openUrl.mutate(url);
		} catch (ipcError) {
			console.error("[model-picker] external.openUrl failed:", ipcError);
			throw ipcError;
		}
	}, []);

	const openOAuthUrl = useCallback(async () => {
		if (!oauthUrl) return;
		try {
			await openExternalUrl(oauthUrl);
			setOauthError(null);
		} catch (error) {
			setOauthError(getErrorMessage(error, "Failed to open browser"));
		}
	}, [oauthUrl, openExternalUrl]);

	const startAnthropicOAuth = useCallback(async () => {
		setOauthError(null);

		try {
			const result = await startAnthropicOAuthMutation.mutateAsync();
			setOauthUrl(result.url);
			setOauthCode("");
			setHasPendingOAuthSession(true);
			setOauthDialogOpen(true);
		} catch (error) {
			setOauthDialogOpen(true);
			setOauthError(
				getErrorMessage(error, "Failed to start Anthropic OAuth flow"),
			);
		}
	}, [startAnthropicOAuthMutation]);

	const copyOAuthUrl = useCallback(async () => {
		if (!oauthUrl) return;
		try {
			await navigator.clipboard.writeText(oauthUrl);
			setOauthError(null);
		} catch (error) {
			setOauthError(getErrorMessage(error, "Failed to copy URL"));
		}
	}, [oauthUrl]);

	const completeAnthropicOAuth = useCallback(async () => {
		const code = oauthCode.trim();
		if (!code) return;

		setOauthError(null);
		try {
			await completeAnthropicOAuthMutation.mutateAsync({ code });
			setHasPendingOAuthSession(false);
			setOauthDialogOpen(false);
			setOauthUrl(null);
			setOauthCode("");
			onModelSelectorOpenChange(true);
			await refetchAnthropicStatus();
		} catch (error) {
			setOauthError(
				getErrorMessage(error, "Failed to complete Anthropic OAuth"),
			);
		}
	}, [
		completeAnthropicOAuthMutation,
		oauthCode,
		onModelSelectorOpenChange,
		refetchAnthropicStatus,
	]);

	const onOAuthDialogOpenChange = useCallback(
		(nextOpen: boolean) => {
			setOauthDialogOpen(nextOpen);
			if (nextOpen) return;
			onModelSelectorOpenChange(true);

			setOauthCode("");
			setOauthError(null);
			setOauthUrl(null);

			if (hasPendingOAuthSession) {
				void cancelAnthropicOAuthMutation
					.mutateAsync()
					.then(() => {
						setHasPendingOAuthSession(false);
					})
					.catch((error) => {
						console.error(
							"[model-picker] Failed to cancel Anthropic OAuth:",
							error,
						);
						setOauthError(
							getErrorMessage(
								error,
								"Failed to cancel Anthropic OAuth session",
							),
						);
					});
			}
		},
		[
			cancelAnthropicOAuthMutation,
			hasPendingOAuthSession,
			onModelSelectorOpenChange,
		],
	);

	const oauthDialog = useMemo(
		() => ({
			open: oauthDialogOpen,
			authUrl: oauthUrl,
			code: oauthCode,
			errorMessage: oauthError,
			isPending: completeAnthropicOAuthMutation.isPending,
			onOpenChange: onOAuthDialogOpenChange,
			onCodeChange: (value: string) => {
				setOauthCode(value);
			},
			onOpenAuthUrl: () => {
				void openOAuthUrl();
			},
			onCopyAuthUrl: () => {
				void copyOAuthUrl();
			},
			onSubmit: () => {
				void completeAnthropicOAuth();
			},
		}),
		[
			completeAnthropicOAuth,
			completeAnthropicOAuthMutation.isPending,
			copyOAuthUrl,
			onOAuthDialogOpenChange,
			openOAuthUrl,
			oauthCode,
			oauthDialogOpen,
			oauthError,
			oauthUrl,
		],
	);

	return {
		isAnthropicAuthenticated: anthropicStatus?.authenticated ?? false,
		isStartingOAuth: startAnthropicOAuthMutation.isPending,
		startAnthropicOAuth,
		oauthDialog,
	};
}
