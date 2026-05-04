import { Button } from "@superset/ui/button";
import { Link } from "@tanstack/react-router";
import { ArrowRight, FolderX } from "lucide-react";

interface WorkspaceNotFoundStateProps {
	workspaceId: string;
}

export function WorkspaceNotFoundState({
	workspaceId,
}: WorkspaceNotFoundStateProps) {
	return (
		<div className="flex h-full w-full items-center justify-center p-6">
			<div className="flex w-full max-w-sm flex-col items-start gap-5">
				<FolderX
					className="size-5 text-muted-foreground"
					strokeWidth={1.5}
					aria-hidden="true"
				/>
				<div className="flex flex-col gap-1.5">
					<h1 className="text-[15px] font-medium tracking-tight text-foreground">
						Workspace not found
					</h1>
					<p className="text-[13px] leading-relaxed text-muted-foreground">
						This workspace may have been removed, or you no longer have access
						to it.
					</p>
				</div>
				<div className="flex w-full items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5">
					<span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
						ID
					</span>
					<code className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
						{workspaceId}
					</code>
				</div>
				<Button
					asChild
					size="sm"
					variant="ghost"
					className="-ml-2 h-7 gap-1.5 px-2 text-[13px] font-medium text-foreground hover:bg-muted/60"
				>
					<Link to="/v2-workspaces">
						Browse workspaces
						<ArrowRight
							className="size-3.5"
							strokeWidth={2}
							aria-hidden="true"
						/>
					</Link>
				</Button>
			</div>
		</div>
	);
}
