import type { SingleTab } from "renderer/stores";
import { useDropTabTarget } from "./useDropTabTarget";

interface SingleTabViewProps {
	tab: SingleTab;
}

export function SingleTabView({ tab }: SingleTabViewProps) {
	const { drop, isDropZone } = useDropTabTarget(tab);
	const attachDrop = (node: HTMLDivElement | null) => {
		if (node) drop(node);
	};

	return (
		<div
			ref={attachDrop}
			className={`flex-1 h-full overflow-auto transition-colors bg-background ${
				isDropZone ? "bg-sidebar" : ""
			}`}
		>
			<div className="h-full w-full p-6">
				<div className="flex flex-col h-full">
					<div className="mb-4">
						<h2 className="text-2xl font-semibold text-foreground mb-1">
							{tab.title}
						</h2>
						<p className="text-sm text-muted-foreground">
							Single tab view {isDropZone && "- Drop to create split"}
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
							Tab content will appear here
						</p>
						{isDropZone && (
							<p className="text-primary text-sm mt-2 font-medium">
								Drop here to create a split view
							</p>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
