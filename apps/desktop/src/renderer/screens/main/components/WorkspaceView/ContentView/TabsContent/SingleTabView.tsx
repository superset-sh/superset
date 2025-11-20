import type { SingleTab } from "renderer/stores";

interface SingleTabViewProps {
	tab: SingleTab;
	isDropZone: boolean;
}

export function SingleTabView({ tab }: SingleTabViewProps) {
	return (
		<div className="flex-1 h-full overflow-auto bg-background">
			<div className="h-full w-full p-6">
				<h2 className="text-2xl font-semibold text-foreground">{tab.title}</h2>
			</div>
		</div>
	);
}
