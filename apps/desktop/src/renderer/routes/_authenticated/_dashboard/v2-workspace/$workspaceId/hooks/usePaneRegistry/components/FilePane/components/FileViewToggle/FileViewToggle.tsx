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
		<div className="inline-flex h-5 min-w-0 items-center gap-0.5 rounded-md bg-muted/50 p-0.5">
			{views.map((view) => {
				const label = resolveViewLabel(view, filePath);

				return (
					<button
						key={view.id}
						type="button"
						title={label}
						className={cn(
							"flex h-4 min-w-0 max-w-20 items-center rounded px-1.5 text-[10px] leading-none transition-colors",
							view.id === activeViewId
								? "bg-background text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground",
						)}
						onClick={() => onChange(view.id)}
					>
						<span className="min-w-0 truncate">{label}</span>
					</button>
				);
			})}
		</div>
	);
}
