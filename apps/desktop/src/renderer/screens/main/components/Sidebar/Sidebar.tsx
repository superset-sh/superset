export function Sidebar() {
	return (
		<aside className="w-64 h-full border-r border-sidebar-border bg-sidebar flex flex-col">
			<div className="p-4 flex-1 overflow-y-auto">
				<nav className="space-y-2">
					{/* Add navigation items here */}
					<div className="text-sm text-sidebar-foreground">
						<p className="font-medium mb-2">Navigation</p>
						<ul className="space-y-1">
							<li className="px-3 py-2 rounded-md hover:bg-sidebar-accent cursor-pointer">
								Dashboard
							</li>
							<li className="px-3 py-2 rounded-md hover:bg-sidebar-accent cursor-pointer">
								Projects
							</li>
							<li className="px-3 py-2 rounded-md hover:bg-sidebar-accent cursor-pointer">
								Settings
							</li>
						</ul>
					</div>
				</nav>
			</div>

			<div className="p-4 border-t border-sidebar-border">
				<div className="text-xs text-sidebar-foreground/60">
					v{/* Add version here */}
				</div>
			</div>
		</aside>
	);
}
