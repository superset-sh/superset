import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { HiCheck, HiChevronDown, HiPlus } from "react-icons/hi2";
import { SiLinear } from "react-icons/si";
import { env } from "renderer/env.renderer";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

interface LinearWorkspacePickerProps {
	organizationId: string;
	projectId: string;
	currentConnectionId: string | null;
	variant?: "compact" | "full";
}

export function LinearWorkspacePicker({
	organizationId,
	projectId,
	currentConnectionId,
	variant = "full",
}: LinearWorkspacePickerProps) {
	const queryClient = useQueryClient();

	const connectionsQuery = useQuery({
		queryKey: ["linear", "listConnections", organizationId],
		queryFn: () =>
			apiTrpcClient.integration.linear.listConnections.query({
				organizationId,
			}),
	});

	const setConnection = useMutation({
		mutationFn: (connectionId: string) =>
			apiTrpcClient.integration.linear.setProjectConnection.mutate({
				projectId,
				connectionId,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["linear", "listConnections", organizationId],
			});
			toast.success("Linear workspace updated");
		},
		onError: (err) => {
			toast.error(err instanceof Error ? err.message : "Failed to update");
		},
	});

	const clearConnection = useMutation({
		mutationFn: () =>
			apiTrpcClient.integration.linear.clearProjectConnection.mutate({
				projectId,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["linear", "listConnections", organizationId],
			});
			toast.success("Linear workspace cleared");
		},
		onError: (err) => {
			toast.error(err instanceof Error ? err.message : "Failed to clear");
		},
	});

	const connections = connectionsQuery.data ?? [];
	const current = connections.find((c) => c.id === currentConnectionId);

	const handleConnectAnother = () => {
		const url = new URL(
			`${env.NEXT_PUBLIC_API_URL}/api/integrations/linear/connect`,
		);
		url.searchParams.set("organizationId", organizationId);
		url.searchParams.set("projectId", projectId);
		window.open(url.toString(), "_blank");
	};

	const triggerLabel = current?.externalOrgName ?? "Pick a workspace";
	const isPending = setConnection.isPending || clearConnection.isPending;

	if (variant === "compact" && connections.length === 0) {
		// No connections at all: collapsed Connect Linear action.
		return (
			<Button
				variant="ghost"
				size="sm"
				onClick={handleConnectAnother}
				className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
			>
				<SiLinear className="size-3.5" />
				<span className="text-sm hidden @4xl:inline">Connect Linear</span>
			</Button>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant={variant === "compact" ? "ghost" : "outline"}
					size="sm"
					disabled={isPending}
					className={
						variant === "compact"
							? "h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
							: "gap-2"
					}
				>
					<SiLinear className="size-3.5" />
					<span
						className={
							variant === "compact" ? "text-sm hidden @4xl:inline" : "text-sm"
						}
					>
						{triggerLabel}
					</span>
					<HiChevronDown className="size-3" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-64">
				{connections.map((conn) => (
					<DropdownMenuItem
						key={conn.id}
						onSelect={() => setConnection.mutate(conn.id)}
						disabled={conn.id === currentConnectionId}
					>
						<SiLinear className="size-3.5 shrink-0" />
						<span className="truncate">
							{conn.externalOrgName ?? "Unnamed workspace"}
						</span>
						{conn.id === currentConnectionId && (
							<HiCheck className="ml-auto size-3.5 shrink-0" />
						)}
					</DropdownMenuItem>
				))}
				{currentConnectionId && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem onSelect={() => clearConnection.mutate()}>
							<span className="text-muted-foreground">
								Clear (no Linear sync)
							</span>
						</DropdownMenuItem>
					</>
				)}
				<DropdownMenuSeparator />
				<DropdownMenuItem onSelect={handleConnectAnother}>
					<HiPlus className="size-3.5 shrink-0" />
					<span>Connect another workspace…</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

interface LinearResyncButtonProps {
	connectionId: string;
	variant?: "compact" | "full";
}

export function LinearResyncButton({
	connectionId,
	variant = "full",
}: LinearResyncButtonProps) {
	const triggerSync = useMutation({
		mutationFn: () =>
			apiTrpcClient.integration.linear.triggerSync.mutate({ connectionId }),
		onSuccess: () => {
			toast.success("Sync queued. Issues will refresh shortly.");
		},
		onError: (err) => {
			toast.error(err instanceof Error ? err.message : "Failed to start sync");
		},
	});

	return (
		<Button
			variant={variant === "compact" ? "ghost" : "outline"}
			size="sm"
			disabled={triggerSync.isPending}
			onClick={() => triggerSync.mutate()}
			title="Resync issues from Linear"
			aria-label="Resync issues from Linear"
			className={
				variant === "compact"
					? "h-8 px-2 text-muted-foreground hover:text-foreground"
					: "gap-2"
			}
		>
			<RefreshCw
				className={`size-3.5 ${triggerSync.isPending ? "animate-spin" : ""}`}
			/>
			{variant === "full" && (
				<span>{triggerSync.isPending ? "Syncing..." : "Resync"}</span>
			)}
		</Button>
	);
}
