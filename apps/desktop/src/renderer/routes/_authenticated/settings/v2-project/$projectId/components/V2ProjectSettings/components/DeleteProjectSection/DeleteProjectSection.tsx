import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
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
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useHostUrls } from "renderer/hooks/host-service/useHostTargetUrl";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

interface DeleteProjectSectionProps {
	projectId: string;
	projectName: string;
	/** Hosts serving this project — the delete fans out to each. */
	hostIds: string[];
}

export function DeleteProjectSection({
	projectId,
	projectName,
	hostIds,
}: DeleteProjectSectionProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const hostUrls = useHostUrls(hostIds);
	const reachableHosts = hostUrls.filter(
		(host): host is { hostId: string; url: string; isLocal: boolean } =>
			host.url !== null,
	);
	const { data: session } = authClient.useSession();
	// Membership for this window's org, not the session's active organization —
	// the session holds one org for every window at once. The member list is
	// scoped server-side by the organization header this window sends.
	const { data: members } = cloudTrpc.organization.listMembers.useQuery({
		includeDeactivated: false,
	});
	const currentUserId = session?.user?.id;
	const currentMember = members?.find((m) => m.userId === currentUserId);
	const isOwner = currentMember?.role === "owner";
	const [isDeleting, setIsDeleting] = useState(false);
	const [isOpen, setIsOpen] = useState(false);

	const handleDelete = async () => {
		if (reachableHosts.length === 0) {
			toast.error(
				t({
					message: "No host serving this project is reachable right now",
				}),
			);
			return;
		}
		setIsDeleting(true);
		try {
			// Projects are local per host — delete on every serving host.
			const results = await Promise.allSettled(
				reachableHosts.map((host) =>
					getHostServiceClientByUrl(host.url).project.remove.mutate({
						projectId,
					}),
				),
			);
			const failed = results.filter((r) => r.status === "rejected");
			if (failed.length === results.length) {
				const first = failed[0] as PromiseRejectedResult;
				throw first.reason instanceof Error
					? first.reason
					: new Error(String(first.reason));
			}
			const skipped = hostIds.length - reachableHosts.length;
			if (failed.length > 0 || skipped > 0) {
				toast.warning(
					t({
						message: `Deleted "${projectName}" from ${results.length - failed.length} of ${hostIds.length} devices — unreachable devices keep their copy`,
					}),
				);
			} else {
				toast.success(
					t({
						message: `Deleted "${projectName}"`,
					}),
				);
			}
			setIsOpen(false);
			navigate({ to: "/settings/projects" });
		} catch (err) {
			toast.error(
				errorMessage(
					err,
					t({
						message: "Failed to delete",
					}),
				),
			);
		} finally {
			setIsDeleting(false);
		}
	};

	return (
		<div className="flex items-center justify-between gap-8 py-2.5">
			<div className="min-w-0 flex-1">
				<div className="text-sm font-medium">
					<Trans>Delete project</Trans>
				</div>
			</div>
			{!isOwner ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<span>
							<Button
								type="button"
								variant="destructive"
								size="sm"
								className="pointer-events-none shrink-0"
								disabled
							>
								<Trans>Delete project</Trans>
							</Button>
						</span>
					</TooltipTrigger>
					<TooltipContent side="left">
						<Trans>Only organization owners can delete this project.</Trans>
					</TooltipContent>
				</Tooltip>
			) : (
				<AlertDialog open={isOpen} onOpenChange={setIsOpen}>
					<AlertDialogTrigger asChild>
						<Button
							type="button"
							variant="destructive"
							size="sm"
							className="shrink-0"
						>
							<Trans>Delete project</Trans>
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>
								<Trans>Delete "{projectName}"?</Trans>
							</AlertDialogTitle>
							<AlertDialogDescription>
								<Trans>
									This deletes the project and all of its workspaces from{" "}
									<span className="font-medium text-foreground">
										every reachable device
									</span>{" "}
									where it is set up. This cannot be undone.
								</Trans>
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel disabled={isDeleting}>
								<Trans>Cancel</Trans>
							</AlertDialogCancel>
							<AlertDialogAction
								onClick={(e) => {
									e.preventDefault();
									handleDelete();
								}}
								disabled={isDeleting || reachableHosts.length === 0}
								className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							>
								{isDeleting ? <Trans>Deleting…</Trans> : <Trans>Delete</Trans>}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			)}
		</div>
	);
}
