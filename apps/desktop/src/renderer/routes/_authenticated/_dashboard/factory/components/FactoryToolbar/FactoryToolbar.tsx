import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import {
	LuFactory,
	LuGitPullRequest,
	LuPlus,
	LuRefreshCw,
	LuSearch,
} from "react-icons/lu";
import type {
	FactoryBoardKind,
	FactoryProject,
	FactoryWorkItem,
} from "../../types";
import { belongsToFactoryBoard } from "../../utils/factory-utils";

interface FactoryToolbarProps {
	activeProjectId: string | null;
	board: FactoryBoardKind;
	items: FactoryWorkItem[];
	projects: FactoryProject[];
	query: string;
	refreshing: boolean;
	onAddWork: () => void;
	onBoardChange: (board: FactoryBoardKind) => void;
	onProjectChange: (projectId: string) => void;
	onQueryChange: (query: string) => void;
	onRefresh: () => void;
}

export function FactoryToolbar({
	activeProjectId,
	board,
	items,
	projects,
	query,
	refreshing,
	onAddWork,
	onBoardChange,
	onProjectChange,
	onQueryChange,
	onRefresh,
}: FactoryToolbarProps) {
	const [compactSearchOpen, setCompactSearchOpen] = useState(false);
	const workCount = items.filter((item) =>
		belongsToFactoryBoard(item, "work"),
	).length;
	const reviewCount = items.filter((item) =>
		belongsToFactoryBoard(item, "review"),
	).length;
	return (
		<header className="shrink-0 border-b border-border bg-background">
			<div className="flex min-h-14 items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
				<div className="flex min-w-0 items-center gap-2">
					<span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
						<LuFactory className="size-4" />
					</span>
					<span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-amber-700 md:hidden dark:text-amber-300">
						POC
					</span>
					<div className="hidden min-w-0 md:block">
						<div className="flex items-center gap-2">
							<h1 className="text-sm font-semibold text-foreground">
								Superset Factory
							</h1>
							<span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
								POC
							</span>
							<span className="rounded border border-border px-1.5 py-0.5 text-xs font-semibold text-muted-foreground">
								Mastra
							</span>
						</div>
						<label className="sr-only" htmlFor="factory-project">
							Factory project
						</label>
						<select
							id="factory-project"
							value={activeProjectId ?? ""}
							onChange={(event) => onProjectChange(event.target.value)}
							className="mt-0.5 max-w-60 appearance-none truncate border-0 bg-transparent p-0 text-xs text-muted-foreground outline-none"
						>
							{projects.map((project) => (
								<option key={project.id} value={project.id}>
									{project.name}
								</option>
							))}
						</select>
					</div>
				</div>

				<div
					className="flex rounded-md border border-border bg-muted/45 p-0.5 sm:ml-3"
					role="tablist"
					aria-label="Factory board"
				>
					<button
						type="button"
						role="tab"
						aria-selected={board === "work"}
						onClick={() => onBoardChange("work")}
						className={cn(
							"flex h-7 items-center gap-1.5 rounded px-2 text-xs transition-colors sm:px-3",
							board === "work"
								? "bg-background font-medium text-foreground shadow-xs"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						Work
						<span className="text-xs tabular-nums text-muted-foreground">
							{workCount}
						</span>
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={board === "review"}
						onClick={() => onBoardChange("review")}
						className={cn(
							"flex h-7 items-center gap-1.5 rounded px-2 text-xs transition-colors sm:px-3",
							board === "review"
								? "bg-background font-medium text-foreground shadow-xs"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						<LuGitPullRequest className="size-3" />
						Reviews
						<span className="text-xs tabular-nums text-muted-foreground">
							{reviewCount}
						</span>
					</button>
				</div>

				<div className="ml-auto flex items-center gap-2">
					<label className="relative hidden lg:block">
						<span className="sr-only">Search Factory work</span>
						<LuSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
						<input
							type="search"
							value={query}
							onChange={(event) => onQueryChange(event.target.value)}
							placeholder="Search work"
							className="h-8 w-44 rounded-md border border-border bg-muted/35 pl-8 pr-3 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
						/>
					</label>
					<button
						type="button"
						onClick={() => setCompactSearchOpen((open) => !open)}
						aria-controls="factory-compact-search"
						aria-expanded={compactSearchOpen}
						aria-label="Search Factory work"
						className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
					>
						<LuSearch className="size-3.5" />
					</button>
					<button
						type="button"
						onClick={onRefresh}
						aria-label="Refresh Factory"
						className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						<LuRefreshCw
							className={cn("size-3.5", refreshing && "animate-spin")}
						/>
					</button>
					<Button size="sm" onClick={onAddWork}>
						<LuPlus className="size-3.5" />
						<span className="hidden sm:inline">Add request</span>
					</Button>
				</div>
			</div>
			{compactSearchOpen && (
				<div
					id="factory-compact-search"
					className="border-t border-border/70 px-3 py-2 lg:hidden"
				>
					<label className="relative block">
						<span className="sr-only">Search Factory work</span>
						<LuSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
						<input
							type="search"
							value={query}
							onChange={(event) => onQueryChange(event.target.value)}
							placeholder="Search title, issue, or repository"
							className="h-8 w-full rounded-md border border-border bg-muted/35 pl-8 pr-3 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
						/>
					</label>
				</div>
			)}
		</header>
	);
}
