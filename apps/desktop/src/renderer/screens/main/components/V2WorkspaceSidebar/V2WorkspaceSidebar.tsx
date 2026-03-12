import { V2ProjectSection } from "./components/V2ProjectSection";
import { V2SidebarEmptyState } from "./components/V2SidebarEmptyState";
import { V2SidebarHeader } from "./components/V2SidebarHeader";
import { useV2SidebarData } from "./hooks/useV2SidebarData";

interface V2WorkspaceSidebarProps {
	isCollapsed?: boolean;
}

export function V2WorkspaceSidebar({
	isCollapsed = false,
}: V2WorkspaceSidebarProps) {
	const { groups, isEmpty, toggleProjectCollapsed } = useV2SidebarData();

	if (isCollapsed) {
		return (
			<div className="h-full border-r border-border bg-muted/45 dark:bg-muted/35" />
		);
	}

	return (
		<div className="flex h-full flex-col border-r border-border bg-muted/45 dark:bg-muted/35">
			<V2SidebarHeader />

			<div className="flex-1 overflow-y-auto hide-scrollbar">
				{isEmpty ? (
					<V2SidebarEmptyState />
				) : (
					<div className="space-y-3 px-2 py-3">
						{groups.map((project) => (
							<V2ProjectSection
								key={project.id}
								projectId={project.id}
								projectName={project.name}
								isCollapsed={project.isCollapsed}
								workspaces={project.workspaces}
								onToggleCollapse={toggleProjectCollapsed}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
