import { Trans } from "@lingui/react/macro";
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
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { HOST_PROJECT_GROUPS_QUERY_PREFIX } from "renderer/hooks/host-projects/useHostProjectGroups";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

interface DeleteProjectGroupSectionProps {
	groupId: string;
	groupName: string;
	hostUrl: string | null;
}

export function DeleteProjectGroupSection({
	groupId,
	groupName,
	hostUrl,
}: DeleteProjectGroupSectionProps) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [isOpen, setIsOpen] = useState(false);

	const remove = useMutation({
		mutationFn: async () => {
			if (!hostUrl) throw new Error("Host unavailable");
			await getHostServiceClientByUrl(hostUrl).projectGroups.remove.mutate({
				groupId,
			});
		},
		onSuccess: async () => {
			setIsOpen(false);
			await queryClient.invalidateQueries({
				queryKey: HOST_PROJECT_GROUPS_QUERY_PREFIX,
			});
			void navigate({ to: "/settings/projects" });
		},
		onError: (error) => toast.error(errorMessage(error)),
	});

	return (
		<div className="flex items-center justify-between gap-8 py-2.5">
			<div className="min-w-0 flex-1">
				<div className="text-sm font-medium">
					<Trans>Delete project</Trans>
				</div>
				<p className="mt-0.5 text-xs text-muted-foreground">
					<Trans>
						Its source folders stay on this device as projects of their own.
					</Trans>
				</p>
			</div>
			<Button
				type="button"
				variant="destructive"
				size="sm"
				className="shrink-0"
				disabled={!hostUrl}
				onClick={() => setIsOpen(true)}
			>
				<Trans>Delete project</Trans>
			</Button>
			<AlertDialog open={isOpen} onOpenChange={setIsOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							<Trans>Delete {groupName}?</Trans>
						</AlertDialogTitle>
						<AlertDialogDescription>
							<Trans>
								New workspaces will no longer check its folders out together.
								Existing workspaces keep their checkouts, and no repository is
								deleted from disk.
							</Trans>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={remove.isPending}>
							<Trans>Cancel</Trans>
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={(event) => {
								event.preventDefault();
								remove.mutate();
							}}
							disabled={remove.isPending}
						>
							<Trans>Delete project</Trans>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
