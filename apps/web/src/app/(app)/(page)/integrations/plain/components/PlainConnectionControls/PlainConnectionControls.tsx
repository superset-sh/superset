"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { DisconnectDialog } from "./components/DisconnectDialog";

interface PlainConnectionControlsProps {
	organizationId: string;
	isConnected: boolean;
	needsReconnect?: boolean;
	workspaceName?: string | null;
}

export function PlainConnectionControls({
	organizationId,
	isConnected,
	needsReconnect = false,
	workspaceName,
}: PlainConnectionControlsProps) {
	const { t } = useLingui();
	const trpc = useTRPC();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [apiKey, setApiKey] = useState("");
	const [webhookSecret, setWebhookSecret] = useState("");

	const invalidateConnection = () => {
		queryClient.invalidateQueries({
			queryKey: trpc.integration.plain.getConnection.queryKey({
				organizationId,
			}),
		});
		router.refresh();
	};

	const connectMutation = useMutation(
		trpc.integration.plain.connect.mutationOptions({
			onSuccess: (result) => {
				const workspaceName = result.workspaceName;
				toast.success(t({ message: `Connected to ${workspaceName}` }));
				if (!result.syncQueued) {
					toast.warning(
						t({
							message:
								"Connected, but the initial sync could not be queued. Reconnect to retry.",
						}),
					);
				}
				setApiKey("");
				setWebhookSecret("");
				invalidateConnection();
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const disconnectMutation = useMutation(
		trpc.integration.plain.disconnect.mutationOptions({
			onSuccess: () => {
				toast.success(t({ message: "Disconnected Plain" }));
				setApiKey("");
				setWebhookSecret("");
				invalidateConnection();
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const handleConnect = () => {
		connectMutation.mutate({
			organizationId,
			apiKey,
			// undefined keeps a previously stored secret on reconnect.
			webhookSecret: webhookSecret || undefined,
		});
	};

	const handleDisconnect = () => {
		disconnectMutation.mutate({ organizationId });
	};

	const connectForm = (
		<div className="max-w-lg space-y-4">
			<div className="space-y-2">
				<Label htmlFor="plain-api-key">
					<Trans>API key</Trans>
				</Label>
				<Input
					id="plain-api-key"
					type="password"
					placeholder="plainApiKey_..."
					value={apiKey}
					onChange={(event) => setApiKey(event.target.value)}
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor="plain-webhook-secret">
					<Trans>Request-signing secret (optional)</Trans>
				</Label>
				<Input
					id="plain-webhook-secret"
					type="password"
					placeholder={t({
						message: "From Plain's Settings → Request signing",
					})}
					value={webhookSecret}
					onChange={(event) => setWebhookSecret(event.target.value)}
				/>
				<p className="text-sm text-muted-foreground">
					<Trans>
						Needed to receive webhooks, so thread changes sync without a manual
						refresh.
					</Trans>
					{needsReconnect && (
						<>
							{" "}
							<Trans>Leave empty to keep the stored secret.</Trans>
						</>
					)}
				</p>
			</div>
			<Button
				onClick={handleConnect}
				disabled={!apiKey.trim() || connectMutation.isPending}
			>
				{connectMutation.isPending ? (
					<Trans>Connecting...</Trans>
				) : needsReconnect ? (
					<Trans>Reconnect Plain</Trans>
				) : (
					<Trans>Connect Plain</Trans>
				)}
			</Button>
		</div>
	);

	if (isConnected && needsReconnect) {
		return (
			<div className="space-y-4">
				<div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
					<AlertTriangle className="mt-0.5 size-4 shrink-0" />
					<div>
						<Trans>
							Plain rejected the stored API key. Enter a new key to resume
							syncing.
						</Trans>
					</div>
				</div>
				{connectForm}
				<DisconnectDialog
					onDisconnect={handleDisconnect}
					isPending={disconnectMutation.isPending}
				/>
			</div>
		);
	}

	if (isConnected) {
		return (
			<div className="space-y-3">
				{workspaceName && (
					<p className="text-sm text-muted-foreground">
						<Trans>
							Connected to <span className="font-medium">{workspaceName}</span>.
						</Trans>
					</p>
				)}
				<DisconnectDialog
					onDisconnect={handleDisconnect}
					isPending={disconnectMutation.isPending}
				/>
			</div>
		);
	}

	return connectForm;
}
