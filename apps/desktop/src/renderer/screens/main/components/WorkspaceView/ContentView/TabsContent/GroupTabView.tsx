import type { TabGroup } from "renderer/stores";
import { useDropTabTarget } from "./useDropTabTarget";

interface GroupTabViewProps {
	tab: TabGroup;
}

export function GroupTabView({ tab }: GroupTabViewProps) {
	const { drop, isDropZone } = useDropTabTarget(tab);

	return (
		<div
			ref={drop as unknown as React.Ref<HTMLDivElement>}
			className={`flex-1 h-full overflow-auto bg-background transition-colors ${
				isDropZone ? "bg-primary/10" : ""
			}`}
		>
			<div className="h-full w-full p-6">
				<div className="flex flex-col h-full">
					<div className="mb-4">
						<h2 className="text-2xl font-semibold text-foreground mb-1">
							{tab.title}
						</h2>
						<p className="text-sm text-muted-foreground">
							Split view - {Object.keys(tab.panes).length} panes{" "}
							{isDropZone && "- Drop to add pane"}
						</p>
					</div>
					<div
						className={`flex-1 border rounded-lg p-4 transition-colors ${
							isDropZone
								? "border-primary border-2 bg-primary/5"
								: "border-border"
						}`}
					>
						<p className="text-muted-foreground">
							React-mosaic split view will appear here
						</p>
						<div className="mt-2 text-xs text-muted-foreground">
							{Object.entries(tab.panes).map(([paneId, pane]) => (
								<div key={paneId}>
									- {pane.title} ({paneId})
								</div>
							))}
						</div>
						{isDropZone && (
							<p className="text-primary text-sm mt-2 font-medium">
								Drop here to add to this split view
							</p>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
