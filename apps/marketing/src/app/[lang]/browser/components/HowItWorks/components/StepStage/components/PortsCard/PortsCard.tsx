import { Trans } from "@lingui/react/macro";
import { ExternalLink } from "lucide-react";

export function PortsCard() {
	return (
		<div className="absolute right-4 bottom-4 left-4 rounded-lg border border-border bg-popover text-xs shadow-xl sm:right-auto sm:left-6 sm:w-72">
			<div className="flex h-8 items-center justify-between border-border border-b px-3 text-muted-foreground">
				<Trans>Ports</Trans>
				<kbd className="rounded-sm border border-border px-1.5 font-mono text-[10px]">
					⌘⇧B
				</kbd>
			</div>
			<div className="space-y-0.5 p-1.5 font-mono text-[11px]">
				<p className="flex items-center gap-2 rounded-md bg-muted/60 px-2 py-1.5 text-foreground">
					<span className="size-1.5 rounded-full bg-emerald-500" />
					localhost:3000
					<ExternalLink className="ml-auto size-3 text-foreground" />
				</p>
				<p className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground">
					<span className="size-1.5 rounded-full bg-emerald-500" />
					localhost:8787
					<ExternalLink className="ml-auto size-3" />
				</p>
			</div>
		</div>
	);
}
