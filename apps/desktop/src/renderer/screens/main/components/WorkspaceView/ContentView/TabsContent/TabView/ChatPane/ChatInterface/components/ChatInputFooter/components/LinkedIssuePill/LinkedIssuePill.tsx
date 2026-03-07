import { Button } from "@superset/ui/button";
import { XIcon } from "lucide-react";
import { LinearIcon } from "renderer/components/icons/LinearIcon";
import { useTabsStore } from "renderer/stores/tabs/store";

interface LinkedIssuePillProps {
	slug: string;
	title: string;
	workspaceId: string;
	onRemove: () => void;
}

export function LinkedIssuePill({
	slug,
	title,
	workspaceId,
	onRemove,
}: LinkedIssuePillProps) {
	const addTaskViewerPane = useTabsStore((s) => s.addTaskViewerPane);

	const openTask = () => {
		addTaskViewerPane(workspaceId, slug);
	};

	return (
		// biome-ignore lint/a11y/useSemanticElements: Contains nested interactive elements
		<div
			role="button"
			tabIndex={0}
			title={title}
			className="group flex cursor-pointer items-center gap-2.5 rounded-md border border-border/50 bg-muted/60 px-3 py-2 text-sm transition-all select-none hover:bg-accent hover:ring-1 hover:ring-border active:scale-[0.98] dark:hover:bg-accent/50"
			onClick={openTask}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					openTask();
				}
			}}
		>
			<div className="relative flex size-7 shrink-0 items-center justify-center rounded-md bg-foreground/10 p-0.5">
				<LinearIcon className="size-5 rounded-sm transition-opacity group-hover:opacity-0" />
				<Button
					aria-label="Remove linked issue"
					className="pointer-events-none absolute inset-0 size-7 cursor-pointer rounded-md p-0 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 [&>svg]:size-3"
					onClick={(e) => {
						e.stopPropagation();
						onRemove();
					}}
					type="button"
					variant="ghost"
				>
					<XIcon />
					<span className="sr-only">Remove</span>
				</Button>
			</div>
			<div className="flex flex-col items-start leading-tight">
				<span className="max-w-[180px] truncate font-medium">
					{title ?? slug}
				</span>
				<div className="flex items-center gap-1.5 text-muted-foreground text-[10px] uppercase tracking-widest">
					<span className="max-w-[80px] truncate">{slug}</span>
					<span>·</span>
					<span>Linear</span>
				</div>
			</div>
		</div>
	);
}
