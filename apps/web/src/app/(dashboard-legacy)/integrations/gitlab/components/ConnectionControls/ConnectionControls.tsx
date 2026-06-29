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
import { Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { env } from "@/env";
import { useTRPC } from "@/trpc/react";

interface ConnectionControlsProps {
	organizationId: string;
	isConnected: boolean;
}

export function ConnectionControls({
	organizationId,
	isConnected,
}: ConnectionControlsProps) {
	const trpc = useTRPC();
	const router = useRouter();
	const queryClient = useQueryClient();

	const [host, setHost] = useState("gitlab.com");
	const [groupId, setGroupId] = useState("");
	const [token, setToken] = useState("");
	const [tokenSubmitting, setTokenSubmitting] = useState(false);

	const disconnectMutation = useMutation(
		trpc.integration.gitlab.disconnect.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: trpc.integration.gitlab.getConnection.queryKey({
						organizationId,
					}),
				});
				router.refresh();
			},
		}),
	);

	const handleOAuthConnect = () => {
		if (!groupId.trim()) {
			toast.error("Enter a GitLab group ID or path first.");
			return;
		}
		const params = new URLSearchParams({
			organizationId,
			groupId: groupId.trim(),
			host: host.trim() || "gitlab.com",
		});
		window.location.href = `${env.NEXT_PUBLIC_API_URL}/api/gitlab/install?${params}`;
	};

	const handleTokenConnect = async () => {
		if (!groupId.trim() || !token.trim()) {
			toast.error("Enter both a group ID/path and a token.");
			return;
		}
		setTokenSubmitting(true);
		try {
			const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/gitlab/connect`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					organizationId,
					groupId: groupId.trim(),
					token: token.trim(),
					host: host.trim() || "gitlab.com",
				}),
			});
			if (!res.ok) {
				const data = (await res.json().catch(() => null)) as {
					error?: string;
				} | null;
				throw new Error(data?.error ?? "Failed to connect");
			}
			toast.success("GitLab connected. Initial sync started.");
			router.refresh();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to connect");
		} finally {
			setTokenSubmitting(false);
		}
	};

	if (isConnected) {
		return (
			<AlertDialog>
				<AlertDialogTrigger asChild>
					<Button variant="outline" disabled={disconnectMutation.isPending}>
						<Unplug className="mr-2 size-4" />
						{disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
					</Button>
				</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Disconnect GitLab?</AlertDialogTitle>
						<AlertDialogDescription>
							This disconnects GitLab from your organization and removes its
							synced projects and merge requests. You can reconnect at any time.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => disconnectMutation.mutate({ organizationId })}
						>
							Disconnect
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		);
	}

	return (
		<div className="space-y-4">
			<div className="grid gap-3 sm:grid-cols-2">
				<div className="space-y-1.5">
					<Label htmlFor="gitlab-host">Instance host</Label>
					<Input
						id="gitlab-host"
						value={host}
						onChange={(e) => setHost(e.target.value)}
						placeholder="gitlab.com"
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="gitlab-group">Group ID or path</Label>
					<Input
						id="gitlab-group"
						value={groupId}
						onChange={(e) => setGroupId(e.target.value)}
						placeholder="e.g. 1234 or acme/platform"
					/>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<Button onClick={handleOAuthConnect}>Connect with OAuth</Button>
				<span className="text-sm text-muted-foreground">
					(gitlab.com / statically-configured)
				</span>
			</div>

			<div className="space-y-1.5 border-t pt-4">
				<Label htmlFor="gitlab-token">
					Or connect with a Group Access Token (self-managed / any host)
				</Label>
				<div className="flex flex-wrap items-center gap-2">
					<Input
						id="gitlab-token"
						type="password"
						value={token}
						onChange={(e) => setToken(e.target.value)}
						placeholder="glpat-…"
						className="max-w-xs"
					/>
					<Button
						variant="outline"
						onClick={handleTokenConnect}
						disabled={tokenSubmitting}
					>
						{tokenSubmitting ? "Connecting..." : "Connect with token"}
					</Button>
				</div>
			</div>
		</div>
	);
}
