export function V2SidebarEmptyState() {
	return (
		<div className="flex h-32 flex-col items-center justify-center px-4 text-center text-sm text-muted-foreground">
			<span>No V2 workspaces yet</span>
			<span className="mt-1 text-xs">
				Create a V2 project and workspace to populate this sidebar
			</span>
		</div>
	);
}
