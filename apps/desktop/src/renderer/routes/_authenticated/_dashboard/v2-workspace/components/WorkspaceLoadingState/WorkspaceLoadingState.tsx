import { Monitor } from "lucide-react";

interface WorkspaceLoadingStateProps {
	message?: string;
}

export function WorkspaceLoadingState({
	message = "Loading workspace...",
}: WorkspaceLoadingStateProps) {
	return (
		<div className="flex h-full w-full items-center justify-center p-6">
			<div className="flex w-full max-w-sm flex-col items-start gap-4">
				<div className="grid size-10 place-items-center rounded-lg border border-border/60 bg-muted/30">
					<Monitor
						className="size-[18px] animate-pulse text-muted-foreground"
						strokeWidth={1.5}
						aria-hidden="true"
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<h1 className="text-[15px] font-medium tracking-tight text-foreground">
						Opening workspace
					</h1>
					<p className="select-text cursor-text text-[13px] leading-relaxed text-muted-foreground">
						{message}
					</p>
				</div>
			</div>
		</div>
	);
}
