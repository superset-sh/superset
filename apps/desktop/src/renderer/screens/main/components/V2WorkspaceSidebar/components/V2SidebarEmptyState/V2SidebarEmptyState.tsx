export function V2SidebarEmptyState() {
	return (
		<div className="flex h-32 flex-col items-center justify-center px-4 text-center text-sm text-muted-foreground">
			<span>No workspaces yet</span>
			<span className="mt-1 text-xs">Add a project to get started</span>
		</div>
	);
}
