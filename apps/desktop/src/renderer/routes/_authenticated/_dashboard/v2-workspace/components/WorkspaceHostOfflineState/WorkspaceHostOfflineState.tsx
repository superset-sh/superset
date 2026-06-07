import { Button } from "@superset/ui/button";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Monitor, Settings, WifiOff } from "lucide-react";

interface WorkspaceHostOfflineStateProps {
	hostId: string;
	hostName: string;
}

export function WorkspaceHostOfflineState({
	hostId,
	hostName,
}: WorkspaceHostOfflineStateProps) {
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
						className="absolute -bottom-0.5 -right-0.5 grid size-3.5 place-items-center rounded-full bg-muted-foreground/80 text-background ring-2 ring-background"
					>
						<WifiOff className="size-2.5" strokeWidth={3} />
					</span>
				</div>

				<div className="flex flex-col gap-1.5">
					<h1 className="text-[15px] font-medium tracking-tight text-foreground">
						Host offline
					</h1>
					<p className="select-text cursor-text text-[13px] leading-relaxed text-muted-foreground">
						This workspace lives on a paired device that is not reachable right
						now. Terminals and file actions are unavailable until that device
						reconnects.
					</p>
				</div>

				<div className="flex w-full flex-col gap-0 overflow-hidden rounded-md border border-border/60 bg-muted/30">
					<div className="flex items-center gap-2.5 px-3 py-2">
						<span
							aria-hidden="true"
							className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40"
						/>
						<span
							className="select-text cursor-text min-w-0 truncate text-[13px] font-medium text-foreground"
							title={hostName}
						>
							{hostName}
						</span>
					</div>
					<div className="border-t border-border/60 px-3 py-2">
						<div className="grid gap-1.5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-3">
							<span className="shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground/70">
								Host ID
							</span>
							<div className="min-w-0 overflow-x-auto sm:text-right">
								<code
									className="inline-block min-w-max select-text cursor-text whitespace-nowrap font-mono text-[12px] tabular-nums text-muted-foreground"
									title={hostId}
								>
									{hostId}
								</code>
							</div>
						</div>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<Button
						asChild
						size="sm"
						variant="ghost"
						className="-ml-2 h-7 gap-1.5 px-2 text-[13px] font-medium text-foreground hover:bg-muted/60"
					>
						<Link to="/settings/hosts/$hostId" params={{ hostId }}>
							<Settings
								className="size-3.5"
								strokeWidth={2}
								aria-hidden="true"
							/>
							Host settings
						</Link>
					</Button>
					<Button
						asChild
						size="sm"
						variant="ghost"
						className="h-7 gap-1.5 px-2 text-[13px] font-medium text-foreground hover:bg-muted/60"
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
