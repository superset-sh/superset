import { Button } from "@superset/ui/button";
import { XIcon } from "lucide-react";
import {
	PRIcon,
	type PRState,
} from "renderer/screens/main/components/PRIcon/PRIcon";

interface LinkedPRPillProps {
	prNumber: number;
	title: string;
	state: string;
	onRemove: () => void;
}

export function LinkedPRPill({
	prNumber,
	title,
	state,
	onRemove,
}: LinkedPRPillProps) {
	return (
		<div
			title={title}
			className="group flex items-center gap-2.5 rounded-md border border-border/50 bg-muted/60 px-3 py-2 text-sm transition-all select-none hover:bg-accent hover:ring-1 hover:ring-border dark:hover:bg-accent/50"
		>
			<div className="relative flex size-7 shrink-0 items-center justify-center rounded-md bg-foreground/10 p-0.5">
				<PRIcon
					state={state as PRState}
					className="size-5 transition-opacity group-hover:opacity-0"
				/>
				<Button
					aria-label="Remove linked PR"
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
				<span className="max-w-[180px] truncate font-medium">{title}</span>
				<div className="flex items-center gap-1.5 text-muted-foreground text-[10px] uppercase tracking-widest">
					<span>#{prNumber}</span>
					<span>·</span>
					<span>GitHub</span>
				</div>
			</div>
		</div>
	);
}
