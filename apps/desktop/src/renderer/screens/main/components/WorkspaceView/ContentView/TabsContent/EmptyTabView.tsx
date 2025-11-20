export function EmptyTabView() {
	return (
		<div className="flex-1 h-full overflow-auto">
			<div className="h-full w-full p-6">
				<div className="flex items-center justify-center h-full">
					<div className="text-center">
						<h2 className="text-2xl font-semibold text-foreground mb-2">
							No Active Tab
						</h2>
						<p className="text-muted-foreground">
							Create a new tab to get started
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
