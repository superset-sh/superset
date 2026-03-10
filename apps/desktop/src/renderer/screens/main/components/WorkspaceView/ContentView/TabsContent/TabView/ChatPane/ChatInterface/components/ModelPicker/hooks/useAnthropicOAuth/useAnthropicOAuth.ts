import { chatServiceTrpc } from "@superset/chat/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

	const startAnthropicOAuth = useCallback(async () => {
		if (autoSubmitTimeoutRef.current) {
			clearTimeout(autoSubmitTimeoutRef.current);
			autoSubmitTimeoutRef.current = null;
		}

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
	}, [openExternalUrl, startAnthropicOAuthMutation]);

	const copyOAuthUrl = useCallback(async () => {
		if (!oauthUrl) return;
		try {
			await navigator.clipboard.writeText(oauthUrl);
			setOauthError(null);
		} catch (error) {
			setOauthError(getErrorMessage(error, "Failed to copy URL"));
		}
	}, [oauthUrl]);

	const submitAnthropicOAuthCode = useCallback(
		async (rawCode: string) => {
			const code = rawCode.trim();
			if (!code) return;

			setOauthError(null);
			try {
				await completeAnthropicOAuthMutation.mutateAsync({ code });
				await electronTrpcClient.modelProviders.clearIssue.mutate({
					providerId: "anthropic",
				});
				await electronUtils.modelProviders.getStatuses.invalidate();
				setHasPendingOAuthSession(false);
				setIsPreparingOAuth(false);
				setOauthDialogOpen(false);
				setOauthUrl(null);
				setOauthCode("");
				onModelSelectorOpenChange(true);
				await refetchAnthropicStatus();
				await onAuthStateChange?.();
			} catch (error) {
				setOauthError(
					getErrorMessage(error, "Failed to complete Anthropic OAuth"),
				);
			}
		},
		[
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
			await electronTrpcClient.modelProviders.clearIssue.mutate({
				providerId: "anthropic",
			});
			await electronUtils.modelProviders.getStatuses.invalidate();
			setHasPendingOAuthSession(false);
			setIsPreparingOAuth(false);
			setOauthDialogOpen(false);
			setOauthUrl(null);
			setOauthCode("");
			onModelSelectorOpenChange(true);
			await refetchAnthropicStatus();
			await onAuthStateChange?.();
		} catch (error) {
			setOauthError(
				getErrorMessage(error, "Failed to disconnect Anthropic OAuth"),
			);
		}
	}, [
		disconnectAnthropicOAuthMutation,
		electronUtils.modelProviders.getStatuses,
		onAuthStateChange,
		onModelSelectorOpenChange,
		refetchAnthropicStatus,
	]);

	const onOAuthDialogOpenChange = useCallback(
		(nextOpen: boolean) => {
			setOauthDialogOpen(nextOpen);
			if (nextOpen) return;
			onModelSelectorOpenChange(true);

			if (autoSubmitTimeoutRef.current) {
				clearTimeout(autoSubmitTimeoutRef.current);
				autoSubmitTimeoutRef.current = null;
			}

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
			hasPendingOAuthSession,
			onModelSelectorOpenChange,
		],
	);

	useEffect(() => {
		return () => {
			if (autoSubmitTimeoutRef.current) {
				clearTimeout(autoSubmitTimeoutRef.current);
			}
		};
	}, []);

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
				anthropicStatus?.source === "managed" &&
				anthropicStatus.method === "oauth" &&
				!hasPendingOAuthSession,
			onOpenChange: onOAuthDialogOpenChange,
			onCodeChange: (value: string) => {
				setOauthCode(value);
				if (autoSubmitTimeoutRef.current) {
					clearTimeout(autoSubmitTimeoutRef.current);
					autoSubmitTimeoutRef.current = null;
				}
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
			anthropicStatus?.method,
			anthropicStatus?.source,
			completeAnthropicOAuth,
			completeAnthropicOAuthMutation.isPending,
			copyOAuthUrl,
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
