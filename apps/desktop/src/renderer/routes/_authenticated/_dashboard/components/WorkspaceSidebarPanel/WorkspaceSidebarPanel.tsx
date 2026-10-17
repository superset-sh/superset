import { ResizablePanel } from "renderer/screens/main/components/ResizablePanel";
import {
	COLLAPSED_WORKSPACE_SIDEBAR_WIDTH,
	DEFAULT_WORKSPACE_SIDEBAR_WIDTH,
	MAX_WORKSPACE_SIDEBAR_WIDTH,
	useWorkspaceSidebarStore,
} from "renderer/stores/workspace-sidebar-state";

export function WorkspaceSidebarPanel({
	className,
	children,
}: {
	className?: string;
	children: React.ReactNode;
}) {
	const width = useWorkspaceSidebarStore((s) => s.width);
	const setWidth = useWorkspaceSidebarStore((s) => s.setWidth);
	const isResizing = useWorkspaceSidebarStore((s) => s.isResizing);
	const setIsResizing = useWorkspaceSidebarStore((s) => s.setIsResizing);
	return (
		<ResizablePanel
			width={width}
			onWidthChange={setWidth}
			isResizing={isResizing}
			onResizingChange={setIsResizing}
			minWidth={COLLAPSED_WORKSPACE_SIDEBAR_WIDTH}
			maxWidth={MAX_WORKSPACE_SIDEBAR_WIDTH}
			handleSide="right"
			clampWidth={false}
			className={className}
			onDoubleClickHandle={() => setWidth(DEFAULT_WORKSPACE_SIDEBAR_WIDTH)}
		>
			{children}
		</ResizablePanel>
	);
}
