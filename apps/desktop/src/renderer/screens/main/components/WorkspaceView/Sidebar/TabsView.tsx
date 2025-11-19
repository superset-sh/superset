export function TabsView() {
	return (
		<nav className="space-y-2">
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
	);
}

