import { cn } from "@superset/ui/utils";
import { type FileView, resolveViewLabel } from "../../registry";

interface FileViewToggleProps {
	views: FileView[];
	activeViewId: string;
	filePath: string;
	onChange: (viewId: string) => void;
}

export function FileViewToggle({
	views,
	activeViewId,
	filePath,
	onChange,
}: FileViewToggleProps) {
	return (
		<div className="inline-flex items-center gap-0.5 rounded bg-muted p-0.5 text-xs">
			{views.map((view) => (
				<button
					key={view.id}
					type="button"
					className={cn(
						"rounded px-2 py-0.5 transition-colors",
						view.id === activeViewId
							? "bg-background text-foreground shadow-sm"
							: "text-muted-foreground hover:text-foreground",
					)}
					onClick={() => onChange(view.id)}
				>
					{resolveViewLabel(view, filePath)}
				</button>
			))}
		</div>
	);
}
