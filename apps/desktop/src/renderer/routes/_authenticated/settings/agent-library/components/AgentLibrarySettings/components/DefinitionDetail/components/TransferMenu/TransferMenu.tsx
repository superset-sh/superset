import type { DefinitionSummary } from "@superset/shared/agent-library";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import { ArrowRightLeft } from "lucide-react";
import { useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { getHostServiceUnavailableMessage } from "renderer/lib/host-service-unavailable";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { getTrpcErrorCode } from "../../../../utils/getTrpcErrorCode";
import type { ScopeInfo } from "../../../AgentLibrarySidebar";

type TransferMode = "copy" | "move";

interface PendingOverwrite {
	toScopeKey: string;
	mode: TransferMode;
	targetLabel: string;
}

export function TransferMenu({
	summary,
	scopes,
	onDone,
}: {
	summary: DefinitionSummary;
	scopes: ScopeInfo[];
	onDone: () => void;
}) {
	const hostService = useLocalHostService();
	const { activeHostUrl } = hostService;
	const [pendingOverwrite, setPendingOverwrite] =
		useState<PendingOverwrite | null>(null);

	const targets = scopes.filter((s) => s.scopeKey !== summary.scopeKey);

	const transferMutation = useMutation({
		mutationFn: ({
			toScopeKey,
			mode,
			overwrite,
		}: {
			toScopeKey: string;
			mode: TransferMode;
			overwrite: boolean;
		}) => {
			if (!activeHostUrl) {
				throw new Error(
					getHostServiceUnavailableMessage(hostService, {
						action: `${mode} the ${summary.kind}`,
					}),
				);
			}
			return getHostServiceClientByUrl(activeHostUrl).agentLibrary.transfer.mutate(
				{
					scopeKey: summary.scopeKey,
					kind: summary.kind,
					name: summary.name,
					toScopeKey,
					mode,
					overwrite,
				},
			);
		},
		onSuccess: (_data, { mode }) => {
			setPendingOverwrite(null);
			toast.success(mode === "copy" ? "Copied." : "Moved.");
			onDone();
		},
		onError: (err, variables) => {
			if (getTrpcErrorCode(err) === "CONFLICT" && !variables.overwrite) {
				const target = targets.find((t) => t.scopeKey === variables.toScopeKey);
				setPendingOverwrite({
					toScopeKey: variables.toScopeKey,
					mode: variables.mode,
					targetLabel: target?.label ?? "the target scope",
				});
				return;
			}
			toast.error(
				err instanceof Error ? err.message : "Failed to transfer definition",
			);
		},
	});

	const scopeLabel = (scope: ScopeInfo) =>
		scope.kind === "user" ? "User (~/.claude)" : scope.label || "Project";

	if (targets.length === 0) return null;

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="sm"
						disabled={transferMutation.isPending}
					>
						<ArrowRightLeft className="size-3.5 mr-1" />
						Copy / Move
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-64">
					<DropdownMenuLabel>Copy to</DropdownMenuLabel>
					{targets.map((target) => (
						<DropdownMenuItem
							key={`copy-${target.scopeKey}`}
							onSelect={() =>
								transferMutation.mutate({
									toScopeKey: target.scopeKey,
									mode: "copy",
									overwrite: false,
								})
							}
						>
							{scopeLabel(target)}
						</DropdownMenuItem>
					))}
					<DropdownMenuSeparator />
					<DropdownMenuLabel>Move to</DropdownMenuLabel>
					{targets.map((target) => (
						<DropdownMenuItem
							key={`move-${target.scopeKey}`}
							onSelect={() =>
								transferMutation.mutate({
									toScopeKey: target.scopeKey,
									mode: "move",
									overwrite: false,
								})
							}
						>
							{scopeLabel(target)}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>

			<AlertDialog
				open={pendingOverwrite !== null}
				onOpenChange={(open) => {
					if (!open) setPendingOverwrite(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Replace "{summary.name}" in {pendingOverwrite?.targetLabel}?
						</AlertDialogTitle>
						<AlertDialogDescription>
							A {summary.kind} named "{summary.name}" already exists there. It
							will be replaced with this one
							{summary.kind === "skill" ? ", including all its files" : ""}.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (!pendingOverwrite) return;
								transferMutation.mutate({
									toScopeKey: pendingOverwrite.toScopeKey,
									mode: pendingOverwrite.mode,
									overwrite: true,
								});
							}}
						>
							Replace
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
