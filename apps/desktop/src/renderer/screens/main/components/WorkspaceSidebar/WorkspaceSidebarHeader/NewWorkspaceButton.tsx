import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useMatchRoute } from "@tanstack/react-router";
import { LuPlus } from "react-icons/lu";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import { STROKE_WIDTH_THICK } from "../constants";

interface NewWorkspaceButtonProps {
	isCollapsed?: boolean;
}

export function NewWorkspaceButton({
	isCollapsed = false,
}: NewWorkspaceButtonProps) {
	const openModal = useOpenNewWorkspaceModal();
	const shortcutText = useHotkeyDisplay("NEW_WORKSPACE").text;

	// Derive current workspace from route to pre-select project in modal
	const matchRoute = useMatchRoute();
	const currentWorkspaceMatch = matchRoute({
		to: "/workspace/$workspaceId",
		fuzzy: true,
	});
	const currentWorkspaceId = currentWorkspaceMatch
		? currentWorkspaceMatch.workspaceId
		: null;

	const { data: currentWorkspace } = electronTrpc.workspaces.get.useQuery(
		{ id: currentWorkspaceId ?? "" },
		{ enabled: !!currentWorkspaceId },
	);

	const handleClick = () => {
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
						className="group flex items-center justify-center size-8 rounded-md bg-accent/40 hover:bg-accent/60 transition-colors"
					>
						<div className="flex items-center justify-center size-5 rounded bg-accent">
							<LuPlus className="size-3" strokeWidth={STROKE_WIDTH_THICK} />
						</div>
					</button>
				</TooltipTrigger>
				<TooltipContent side="right">
					New Workspace ({shortcutText})
				</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<button
			type="button"
			onClick={handleClick}
			className="group flex items-center gap-2 px-2 py-1.5 w-full text-sm font-medium text-muted-foreground hover:text-foreground bg-accent/40 hover:bg-accent/60 rounded-md transition-colors"
		>
			<div className="flex items-center justify-center size-5 rounded bg-accent">
				<LuPlus className="size-3" strokeWidth={STROKE_WIDTH_THICK} />
			</div>
			<span className="flex-1 text-left">New Workspace</span>
			<span className="text-[10px] text-muted-foreground/40 group-hover:text-muted-foreground/80 transition-colors font-mono tabular-nums shrink-0">
				{shortcutText}
			</span>
		</button>
	);
}
