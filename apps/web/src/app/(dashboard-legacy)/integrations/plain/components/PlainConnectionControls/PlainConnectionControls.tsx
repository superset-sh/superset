"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTRPC } from "@/trpc/react";

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
			onSuccess: invalidateConnection,
		}),
	);

	const handleConnect = () => {
		connectMutation.mutate({
			organizationId,
			apiKey,
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

interface DisconnectDialogProps {
	onDisconnect: () => void;
	isPending: boolean;
}

function DisconnectDialog({ onDisconnect, isPending }: DisconnectDialogProps) {
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant="outline" disabled={isPending}>
					<Unplug className="mr-2 size-4" />
					{isPending ? "Disconnecting..." : "Disconnect"}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Disconnect Plain?</AlertDialogTitle>
					<AlertDialogDescription>
						This removes the connection and deletes the synced Plain tasks from
						Superset. Threads in Plain are not touched. You can reconnect at any
						time.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction onClick={onDisconnect}>
						Disconnect
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
