import type { RendererContext } from "@superset/panes";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useCallback } from "react";
import { TbExternalLink } from "react-icons/tb";
import { useOpenInExternalEditor } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useOpenInExternalEditor";
import { useSharedFileDocument } from "../../../../../../state/fileDocumentStore";
import type { FilePaneData, PaneViewerData } from "../../../../../../types";
import { orderForToggle, resolveActivePaneView } from "../../registry";
import { FileViewToggle } from "../FileViewToggle";

interface FilePaneHeaderExtrasProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
}

export function FilePaneHeaderExtras({
	context,
	workspaceId,
}: FilePaneHeaderExtrasProps) {
	const data = context.pane.data as FilePaneData;
	const { filePath } = data;
	const openInExternalEditor = useOpenInExternalEditor(workspaceId);

	const document = useSharedFileDocument({
		workspaceId,
		absolutePath: filePath,
	});

	const handleChangeView = useCallback(
		(viewId: string) => {
			context.actions.updateData({
				...data,
				viewId,
			} as PaneViewerData);
		},
		[context.actions, data],
	);

	const { views, activeView } = resolveActivePaneView(document, data);
	const shouldShowToggle =
		views.length > 1 && !data.forceViewId && activeView !== null;

	const handleOpenExternal = useCallback(() => {
		openInExternalEditor(filePath);
	}, [filePath, openInExternalEditor]);

	return (
		<div className="flex items-center gap-1">
			{shouldShowToggle && activeView && (
				<FileViewToggle
					views={orderForToggle(views)}
					activeViewId={activeView.id}
					filePath={filePath}
					onChange={handleChangeView}
				/>
			)}
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label="Open in editor"
						onClick={handleOpenExternal}
						className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
					>
						<TbExternalLink className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					Open in editor
				</TooltipContent>
			</Tooltip>
		</div>
	);
}
