import { useV2SidebarData } from "./hooks/useV2SidebarData";

interface V2WorkspaceSidebarProps {
	isCollapsed?: boolean;
}

export function V2WorkspaceSidebar({
	isCollapsed = false,
}: V2WorkspaceSidebarProps) {
	const { groups, isEmpty } = useV2SidebarData();

	if (isCollapsed) {
		return (
			<div className="h-full border-r border-border bg-muted/45 dark:bg-muted/35" />
		);
	}

	return (
		<div className="flex h-full flex-col border-r border-border bg-muted/45 dark:bg-muted/35">
			<div className="border-b border-border px-3 py-2">
				<div className="text-sm font-medium">Workspaces</div>
				<div className="text-xs text-muted-foreground">
					V2 Electric-backed sidebar
				</div>
			</div>

			<div className="flex-1 overflow-y-auto hide-scrollbar">
				{isEmpty ? (
					<div className="flex h-32 flex-col items-center justify-center px-4 text-center text-sm text-muted-foreground">
						<span>No V2 workspaces yet</span>
						<span className="mt-1 text-xs">
							Create a V2 project and workspace to populate this sidebar
						</span>
					</div>
				) : (
					<div className="space-y-4 px-2 py-3">
						{groups.map((project) => (
							<div key={project.id} className="space-y-1">
								<div className="px-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
									{project.name}
								</div>
								<div className="space-y-1">
									{project.workspaces.map((workspace) => (
										<div
											key={workspace.id}
											className="rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
										>
											<div className="truncate">{workspace.name}</div>
											<div className="truncate text-xs text-muted-foreground">
												{workspace.branch}
											</div>
										</div>
									))}
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
