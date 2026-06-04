"use client";

import { LuChevronDown, LuExternalLink, LuX } from "react-icons/lu";
import type { ActiveDemo } from "../../types";

interface WindowChromeProps {
	activeDemo?: ActiveDemo;
}

const TITLE_BY_DEMO: Record<ActiveDemo, { title: string; branch: string }> = {
	"Use Any Agents": {
		title: "use any agents in parallel",
		branch: "use-any-agents",
	},
	"Create Parallel Branches": {
		title: "set up parallel branches",
		branch: "create-parallel-branches",
	},
	"See Changes": {
		title: "review cloud-workspace diff",
		branch: "see-changes",
	},
	"Open in Any IDE": {
		title: "edit in any IDE",
		branch: "open-in-any-ide",
	},
};

export function WindowChrome({
	activeDemo = "Use Any Agents",
}: WindowChromeProps) {
	const { title, branch } = TITLE_BY_DEMO[activeDemo];
	return (
		<div className="flex h-9 items-center gap-2 border-b border-border bg-background px-3">
			<div className="flex min-w-0 flex-1 items-center gap-1">
				<span className="flex h-6 items-center gap-1.5 truncate border border-border bg-background px-2 text-[11px] font-medium text-foreground/90">
					<span className="truncate">{title}</span>
				</span>
				<span className="flex h-6 items-center gap-1.5 border border-border bg-background px-2 font-mono text-[10px] text-muted-foreground/80">
					<span className="size-1.5 rounded-full bg-brand" />
					<span className="truncate">{branch}</span>
					<LuX className="size-2.5 text-muted-foreground/40" />
				</span>
			</div>

			<div className="ml-2 flex items-center gap-2">
				<button
					type="button"
					className="flex h-6 items-center gap-1 border border-border bg-background px-2 text-[10px] font-medium uppercase tracking-[0.06em] text-foreground/85 hover:bg-foreground/[0.04]"
				>
					<LuExternalLink className="size-2.5 text-muted-foreground/65" />
					<span>Open</span>
					<LuChevronDown className="size-2.5 text-muted-foreground/55" />
				</button>
			</div>
		</div>
	);
}
