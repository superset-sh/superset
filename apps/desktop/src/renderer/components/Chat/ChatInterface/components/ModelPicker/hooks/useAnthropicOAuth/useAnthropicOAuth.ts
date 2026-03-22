import { chatServiceTrpc } from "@superset/chat/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { electronTrpc } from "renderer/lib/electron-trpc";
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
	onAuthStateChange?: () => Promise<void> | void;
}

interface AnthropicOAuthDialogState {
	open: boolean;
	authUrl: string | null;
	code: string;
	errorMessage: string | null;
	isPreparing: boolean;
	isPending: boolean;
	canDisconnect: boolean;
	onOpenChange: (open: boolean) => void;
	onCodeChange: (value: string) => void;
	onOpenAuthUrl: () => void;
	onCopyAuthUrl: () => void;
	onDisconnect: () => void;
	onRetry: () => void;
	onSubmit: () => void;
}

interface UseAnthropicOAuthResult {
	isAnthropicAuthenticated: boolean;
	isStartingOAuth: boolean;
	startAnthropicOAuth: () => Promise<void>;
	oauthDialog: AnthropicOAuthDialogState;
}

function looksLikeAnthropicOAuthInput(value: string): boolean {
	const trimmed = value.trim();
	if (!trimmed) {
		return false;
	}

	if (trimmed.length > 50 && trimmed.includes("#")) {
		return true;
	}

	try {
		const url = new URL(trimmed);
		return Boolean(
			url.searchParams.get("code") && url.searchParams.get("state"),
		);
	} catch {
		return false;
	}
}

export function useAnthropicOAuth({
	isModelSelectorOpen,
	onModelSelectorOpenChange,
	onAuthStateChange,
}: UseAnthropicOAuthParams): UseAnthropicOAuthResult {
	const [oauthDialogOpen, setOauthDialogOpen] = useState(false);
	const [oauthUrl, setOauthUrl] = useState<string | null>(null);
	const [oauthCode, setOauthCode] = useState("");
	const [oauthError, setOauthError] = useState<string | null>(null);
	const [hasPendingOAuthSession, setHasPendingOAuthSession] = useState(false);
	const [isPreparingOAuth, setIsPreparingOAuth] = useState(false);
	const autoSubmitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const electronUtils = electronTrpc.useUtils();

	const { data: anthropicStatus, refetch: refetchAnthropicStatus } =
		chatServiceTrpc.auth.getAnthropicStatus.useQuery();
	const startAnthropicOAuthMutation =
		chatServiceTrpc.auth.startAnthropicOAuth.useMutation();
	const completeAnthropicOAuthMutation =
		chatServiceTrpc.auth.completeAnthropicOAuth.useMutation();
	const cancelAnthropicOAuthMutation =
		chatServiceTrpc.auth.cancelAnthropicOAuth.useMutation();
	const disconnectAnthropicOAuthMutation =
		chatServiceTrpc.auth.disconnectAnthropicOAuth.useMutation();

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

	const clearAutoSubmitTimeout = useCallback(() => {
		if (!autoSubmitTimeoutRef.current) return;
		clearTimeout(autoSubmitTimeoutRef.current);
		autoSubmitTimeoutRef.current = null;
	}, []);

	const startAnthropicOAuth = useCallback(async () => {
		clearAutoSubmitTimeout();

		setOauthDialogOpen(true);
		setOauthUrl(null);
		setOauthCode("");
		setOauthError(null);
		setHasPendingOAuthSession(false);
		setIsPreparingOAuth(true);

		try {
			const result = await startAnthropicOAuthMutation.mutateAsync();
			setOauthUrl(result.url);
			setHasPendingOAuthSession(true);
			try {
				await openExternalUrl(result.url);
			} catch (error) {
				setOauthError(getErrorMessage(error, "Failed to open browser"));
			}
		} catch (error) {
			setOauthError(
				getErrorMessage(error, "Failed to start Anthropic OAuth flow"),
			);
		} finally {
			setIsPreparingOAuth(false);
		}
	}, [clearAutoSubmitTimeout, openExternalUrl, startAnthropicOAuthMutation]);

	const { copyToClipboard } = useCopyToClipboard();
	const copyOAuthUrl = useCallback(() => {
		if (!oauthUrl) return;
		copyToClipboard(oauthUrl);
		setOauthError(null);
	}, [oauthUrl, copyToClipboard]);

	const submitAnthropicOAuthCode = useCallback(
		async (rawCode: string) => {
			const code = rawCode.trim();
			if (!code) return;
			clearAutoSubmitTimeout();

			setOauthError(null);
			try {
				await completeAnthropicOAuthMutation.mutateAsync({ code });
			} catch (error) {
				setOauthError(
					getErrorMessage(error, "Failed to complete Anthropic OAuth"),
				);
				return;
			}

			setHasPendingOAuthSession(false);
			setIsPreparingOAuth(false);
			setOauthDialogOpen(false);
			setOauthUrl(null);
			setOauthCode("");
			onModelSelectorOpenChange(true);

			try {
				await electronTrpcClient.modelProviders.clearIssue.mutate({
					providerId: "anthropic",
				});
				await electronUtils.modelProviders.getStatuses.invalidate();
				await refetchAnthropicStatus();
				await onAuthStateChange?.();
			} catch (error) {
				console.error(
					"[model-picker] Anthropic OAuth follow-up refresh failed:",
					error,
				);
			}
		},
		[
			clearAutoSubmitTimeout,
			completeAnthropicOAuthMutation,
			electronUtils.modelProviders.getStatuses.invalidate,
			onAuthStateChange,
			onModelSelectorOpenChange,
			refetchAnthropicStatus,
		],
	);

	const completeAnthropicOAuth = useCallback(async () => {
		await submitAnthropicOAuthCode(oauthCode);
	}, [oauthCode, submitAnthropicOAuthCode]);

	const disconnectAnthropicOAuth = useCallback(async () => {
		setOauthError(null);
		try {
			await disconnectAnthropicOAuthMutation.mutateAsync();
		} catch (error) {
			setOauthError(
				getErrorMessage(error, "Failed to disconnect Anthropic OAuth"),
			);
			return;
		}

		setHasPendingOAuthSession(false);
		setIsPreparingOAuth(false);
		setOauthDialogOpen(false);
		setOauthUrl(null);
		setOauthCode("");
		onModelSelectorOpenChange(true);

		try {
			await electronTrpcClient.modelProviders.clearIssue.mutate({
				providerId: "anthropic",
			});
			await electronUtils.modelProviders.getStatuses.invalidate();
			await refetchAnthropicStatus();
			await onAuthStateChange?.();
		} catch (error) {
			console.error(
				"[model-picker] Anthropic OAuth disconnect follow-up refresh failed:",
				error,
			);
		}
	}, [
		disconnectAnthropicOAuthMutation,
		electronUtils.modelProviders.getStatuses.invalidate,
		onAuthStateChange,
		onModelSelectorOpenChange,
		refetchAnthropicStatus,
	]);

	const onOAuthDialogOpenChange = useCallback(
		(nextOpen: boolean) => {
			setOauthDialogOpen(nextOpen);
			if (nextOpen) return;
			onModelSelectorOpenChange(true);
			clearAutoSubmitTimeout();

			setOauthCode("");
			setOauthError(null);
			setOauthUrl(null);
			setIsPreparingOAuth(false);

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
			clearAutoSubmitTimeout,
			hasPendingOAuthSession,
			onModelSelectorOpenChange,
		],
	);

	useEffect(() => {
		return () => {
			clearAutoSubmitTimeout();
		};
	}, [clearAutoSubmitTimeout]);

	const oauthDialog = useMemo(
		() => ({
			open: oauthDialogOpen,
			authUrl: oauthUrl,
			code: oauthCode,
			errorMessage: oauthError,
			isPreparing: isPreparingOAuth,
			isPending:
				completeAnthropicOAuthMutation.isPending ||
				disconnectAnthropicOAuthMutation.isPending,
			canDisconnect:
				anthropicStatus?.hasManagedOAuth === true && !hasPendingOAuthSession,
			onOpenChange: onOAuthDialogOpenChange,
			onCodeChange: (value: string) => {
				setOauthCode(value);
				clearAutoSubmitTimeout();
				if (
					!hasPendingOAuthSession ||
					completeAnthropicOAuthMutation.isPending ||
					!looksLikeAnthropicOAuthInput(value)
				) {
					return;
				}
				autoSubmitTimeoutRef.current = setTimeout(() => {
					void submitAnthropicOAuthCode(value).finally(() => {
						autoSubmitTimeoutRef.current = null;
					});
				}, 100);
			},
			onOpenAuthUrl: () => {
				void openOAuthUrl();
			},
			onCopyAuthUrl: () => {
				void copyOAuthUrl();
			},
			onDisconnect: () => {
				void disconnectAnthropicOAuth();
			},
			onRetry: () => {
				void startAnthropicOAuth();
			},
			onSubmit: () => {
				void completeAnthropicOAuth();
			},
		}),
		[
			anthropicStatus?.hasManagedOAuth,
			completeAnthropicOAuth,
			completeAnthropicOAuthMutation.isPending,
			copyOAuthUrl,
			clearAutoSubmitTimeout,
			disconnectAnthropicOAuth,
			disconnectAnthropicOAuthMutation.isPending,
			hasPendingOAuthSession,
			isPreparingOAuth,
			onOAuthDialogOpenChange,
			openOAuthUrl,
			oauthCode,
			oauthDialogOpen,
			oauthError,
			oauthUrl,
			startAnthropicOAuth,
			submitAnthropicOAuthCode,
		],
	);

	return {
		isAnthropicAuthenticated: anthropicStatus?.authenticated ?? false,
		isStartingOAuth: startAnthropicOAuthMutation.isPending,
		startAnthropicOAuth,
		oauthDialog,
	};
}
