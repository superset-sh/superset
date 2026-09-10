import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { DeleteProjectDialog } from "renderer/routes/_authenticated/components/DeleteProjectDialog";
import { useIsOrganizationOwner } from "renderer/routes/_authenticated/hooks/useIsOrganizationOwner";

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
	const navigate = useNavigate();
	const isOwner = useIsOrganizationOwner();
	const [isOpen, setIsOpen] = useState(false);

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
				<DeleteProjectDialog
					open={isOpen}
					onOpenChange={setIsOpen}
					projectId={projectId}
					projectName={projectName}
					hostIds={hostIds}
					onDeleted={() => navigate({ to: "/settings/projects" })}
				>
					<Button
						type="button"
						variant="destructive"
						size="sm"
						className="shrink-0"
					>
						<Trans>Delete project</Trans>
					</Button>
				</DeleteProjectDialog>
			)}
		</div>
	);
}
