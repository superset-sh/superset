"use client";

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
				toast.success(`Connected to ${result.workspaceName}`);
				if (!result.syncQueued) {
					toast.warning(
						"Connected, but the initial sync could not be queued. Reconnect to retry.",
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
				toast.success("Disconnected Plain");
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
				<Label htmlFor="plain-api-key">API key</Label>
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
					Request-signing secret (optional)
				</Label>
				<Input
					id="plain-webhook-secret"
					type="password"
					placeholder="From Plain's Settings → Request signing"
					value={webhookSecret}
					onChange={(event) => setWebhookSecret(event.target.value)}
				/>
				<p className="text-sm text-muted-foreground">
					Needed to receive webhooks, so thread changes sync without a manual
					refresh.
					{needsReconnect && " Leave empty to keep the stored secret."}
				</p>
			</div>
			<Button
				onClick={handleConnect}
				disabled={!apiKey.trim() || connectMutation.isPending}
			>
				{connectMutation.isPending
					? "Connecting..."
					: needsReconnect
						? "Reconnect Plain"
						: "Connect Plain"}
			</Button>
		</div>
	);

	if (isConnected && needsReconnect) {
		return (
			<div className="space-y-4">
				<div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
					<AlertTriangle className="mt-0.5 size-4 shrink-0" />
					<div>
						Plain rejected the stored API key. Enter a new key to resume
						syncing.
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
						Connected to <span className="font-medium">{workspaceName}</span>.
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
