import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useMatchRoute } from "@tanstack/react-router";
import { LuPlus } from "react-icons/lu";
import { trpc } from "renderer/lib/trpc";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import { STROKE_WIDTH_THICK } from "../constants";

interface NewWorkspaceButtonProps {
	isCollapsed?: boolean;
}

export function NewWorkspaceButton({
	isCollapsed = false,
}: NewWorkspaceButtonProps) {
	const openModal = useOpenNewWorkspaceModal();

	// Derive current workspace from route to pre-select project in modal
	const matchRoute = useMatchRoute();
	const currentWorkspaceMatch = matchRoute({
		to: "/workspace/$workspaceId",
		fuzzy: true,
	});
	const currentWorkspaceId = currentWorkspaceMatch
		? currentWorkspaceMatch.workspaceId
		: null;

	const { data: currentWorkspace } = trpc.workspaces.get.useQuery(
		{ id: currentWorkspaceId ?? "" },
		{ enabled: !!currentWorkspaceId },
	);

	const handleClick = () => {
		// projectId may be undefined if no workspace is active in route
		// openModal handles undefined by opening without a pre-selected project
		const projectId = currentWorkspace?.projectId;
		openModal(projectId);
	};

	if (isCollapsed) {
		return (
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={handleClick}
						className="group flex items-center justify-center size-8 rounded-md hover:bg-accent/50 transition-colors"
					>
						<div className="flex items-center justify-center size-5 rounded bg-accent">
							<LuPlus className="size-3" strokeWidth={STROKE_WIDTH_THICK} />
						</div>
					</button>
				</TooltipTrigger>
				<TooltipContent side="right">New Workspace</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<button
			type="button"
			onClick={handleClick}
			className="flex items-center gap-2 px-2 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md transition-colors"
		>
			<div className="flex items-center justify-center size-5 rounded bg-accent">
				<LuPlus className="size-3" strokeWidth={STROKE_WIDTH_THICK} />
			</div>
			<span>New Workspace</span>
		</button>
	);
}
