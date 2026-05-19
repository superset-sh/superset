import { Button } from "@superset/ui/button";
import { Link } from "@tanstack/react-router";
import { ArrowRight, RefreshCw, TriangleAlert } from "lucide-react";

interface WorkspaceStatusUnavailableStateProps {
	onRefresh: () => void;
	isRefreshing?: boolean;
}

export function WorkspaceStatusUnavailableState({
	onRefresh,
	isRefreshing = false,
}: WorkspaceStatusUnavailableStateProps) {
	return (
		<div className="flex h-full w-full items-center justify-center p-6">
			<div className="flex w-full max-w-md flex-col items-start gap-5">
				<div className="grid size-10 place-items-center rounded-lg border border-border/60 bg-muted/30">
					<TriangleAlert
						className="size-[18px] text-muted-foreground"
						strokeWidth={1.5}
						aria-hidden="true"
					/>
				</div>

				<div className="flex flex-col gap-1.5">
					<h1 className="select-text cursor-text text-[15px] font-medium tracking-tight text-foreground">
						Workspace status unavailable
					</h1>
					<p className="select-text cursor-text text-[13px] leading-relaxed text-muted-foreground">
						Superset could not confirm whether this workspace is available on
						the host. Refresh after the host is reachable again.
					</p>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<Button
						size="sm"
						variant="ghost"
						className="h-7 gap-1.5 px-2 text-[13px] font-medium"
						onClick={onRefresh}
						disabled={isRefreshing}
					>
						<RefreshCw
							className="size-3.5"
							strokeWidth={2}
							aria-hidden="true"
						/>
						Refresh
					</Button>
					<Button
						asChild
						size="sm"
						variant="ghost"
						className="h-7 gap-1.5 px-2 text-[13px] font-medium"
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
		</div>
	);
}
