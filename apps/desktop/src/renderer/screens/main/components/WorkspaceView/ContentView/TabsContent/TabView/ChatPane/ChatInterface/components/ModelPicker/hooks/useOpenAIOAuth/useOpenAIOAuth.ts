import { chatServiceTrpc } from "@superset/chat/client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";

function getErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error && error.message.trim()) {
		return error.message;
	}
	return fallback;
}

interface UseOpenAIOAuthParams {
	isModelSelectorOpen: boolean;
	onModelSelectorOpenChange: (open: boolean) => void;
}

interface OpenAIOAuthDialogState {
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

interface UseOpenAIOAuthResult {
	isOpenAIAuthenticated: boolean;
	isStartingOAuth: boolean;
	startOpenAIOAuth: () => Promise<void>;
	oauthDialog: OpenAIOAuthDialogState;
}

export function useOpenAIOAuth({
	isModelSelectorOpen,
	onModelSelectorOpenChange,
}: UseOpenAIOAuthParams): UseOpenAIOAuthResult {
	const [oauthDialogOpen, setOauthDialogOpen] = useState(false);
	const [oauthUrl, setOauthUrl] = useState<string | null>(null);
	const [oauthCode, setOauthCode] = useState("");
	const [oauthError, setOauthError] = useState<string | null>(null);
	const [hasPendingOAuthSession, setHasPendingOAuthSession] = useState(false);

	const { data: openAIStatus, refetch: refetchOpenAIStatus } =
		chatServiceTrpc.auth.getOpenAIStatus.useQuery();
	const startOpenAIOAuthMutation =
		chatServiceTrpc.auth.startOpenAIOAuth.useMutation();
	const completeOpenAIOAuthMutation =
		chatServiceTrpc.auth.completeOpenAIOAuth.useMutation();
	const cancelOpenAIOAuthMutation =
		chatServiceTrpc.auth.cancelOpenAIOAuth.useMutation();

	useEffect(() => {
		if (!isModelSelectorOpen) return;
		void refetchOpenAIStatus();
	}, [isModelSelectorOpen, refetchOpenAIStatus]);

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

	const startOpenAIOAuth = useCallback(async () => {
		setOauthError(null);
		try {
			const result = await startOpenAIOAuthMutation.mutateAsync();
			setOauthUrl(result.url);
			setOauthCode("");
			setHasPendingOAuthSession(true);
			setOauthDialogOpen(true);
		} catch (error) {
			setOauthDialogOpen(true);
			setOauthError(
				getErrorMessage(error, "Failed to start OpenAI OAuth flow"),
			);
		}
	}, [startOpenAIOAuthMutation]);

	const copyOAuthUrl = useCallback(async () => {
		if (!oauthUrl) return;
		try {
			await navigator.clipboard.writeText(oauthUrl);
			setOauthError(null);
		} catch (error) {
			setOauthError(getErrorMessage(error, "Failed to copy URL"));
		}
	}, [oauthUrl]);

	const completeOpenAIOAuth = useCallback(async () => {
		setOauthError(null);
		try {
			const code = oauthCode.trim();
			await completeOpenAIOAuthMutation.mutateAsync({
				code: code.length > 0 ? code : undefined,
			});
			setHasPendingOAuthSession(false);
			setOauthDialogOpen(false);
			setOauthUrl(null);
			setOauthCode("");
			onModelSelectorOpenChange(true);
			await refetchOpenAIStatus();
		} catch (error) {
			setOauthError(getErrorMessage(error, "Failed to complete OpenAI OAuth"));
		}
	}, [
		completeOpenAIOAuthMutation,
		oauthCode,
		onModelSelectorOpenChange,
		refetchOpenAIStatus,
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
				void cancelOpenAIOAuthMutation
					.mutateAsync()
					.then(() => {
						setHasPendingOAuthSession(false);
					})
					.catch((error) => {
						console.error(
							"[model-picker] Failed to cancel OpenAI OAuth:",
							error,
						);
						setOauthError(
							getErrorMessage(error, "Failed to cancel OpenAI OAuth session"),
						);
					});
			}
		},
		[
			cancelOpenAIOAuthMutation,
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
			isPending: completeOpenAIOAuthMutation.isPending,
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
				void completeOpenAIOAuth();
			},
		}),
		[
			completeOpenAIOAuth,
			completeOpenAIOAuthMutation.isPending,
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
		isOpenAIAuthenticated: openAIStatus?.authenticated ?? false,
		isStartingOAuth: startOpenAIOAuthMutation.isPending,
		startOpenAIOAuth,
		oauthDialog,
	};
}
