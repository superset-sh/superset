import { Button } from "@superset/ui/button";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Monitor } from "lucide-react";

interface WorkspaceHostUnreachableStateProps {
	hostName: string;
}

export function WorkspaceHostUnreachableState({
	hostName,
}: WorkspaceHostUnreachableStateProps) {
	return (
		<div className="flex h-full w-full items-center justify-center p-6">
			<div className="flex w-full max-w-sm flex-col items-start gap-6">
				<div className="relative">
					<div className="grid size-10 place-items-center rounded-lg border border-border/60 bg-muted/30">
						<Monitor
							className="size-[18px] text-muted-foreground"
							strokeWidth={1.5}
							aria-hidden="true"
						/>
					</div>
					<span
						aria-hidden="true"
						className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-amber-500/90 ring-2 ring-background"
					/>
				</div>

				<div className="flex flex-col gap-1.5">
					<h1 className="text-[15px] font-medium tracking-tight text-foreground">
						Host is unreachable
					</h1>
					<p className="select-text cursor-text text-[13px] leading-relaxed text-muted-foreground">
						The cloud reports this host as online, but Desktop couldn't reach it
						through the relay. The host process may have lost its tunnel without
						disconnecting cleanly. Restarting the Superset host service on that
						device usually clears it.
					</p>
				</div>

				<div className="flex w-full items-center gap-2.5 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
					<span
						aria-hidden="true"
						className="size-1.5 shrink-0 rounded-full bg-amber-500/90"
					/>
					<span
						className="select-text cursor-text min-w-0 truncate text-[13px] font-medium text-foreground"
						title={hostName}
					>
						{hostName}
					</span>
					<span className="ml-auto shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground/70">
						Unreachable
					</span>
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
