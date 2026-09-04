"use client";

import { Trans } from "@lingui/react/macro";
import { OverflowFadeContainer } from "@superset/ui/overflow-fade-container";
import { useSearchContext } from "fumadocs-ui/contexts/search";
import { Search } from "lucide-react";
import { AsideLink } from "@/components/AsideLink";
import { cn } from "@/lib/cn";
import { sections } from "./components/SidebarContent";

export default function Sidebar() {
	const { setOpenSearch } = useSearchContext();

	return (
		<div className={cn("fixed start-0 top-0")}>
			<aside
				className={cn(
					"top-[55px] navbar:flex hidden navbar:w-[268px] lg:w-[286px]! absolute h-[calc(100dvh-55px)] flex-col w-[var(--fd-sidebar-width)]",
				)}
			>
				<div className="shrink-0 px-4 pt-4 pb-2">
					<button
						type="button"
						className="flex w-full items-center gap-2 rounded-md border border-border/50 px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground"
						onClick={() => setOpenSearch(true)}
					>
						<Search className="size-3.5 shrink-0 opacity-70" />
						<span className="grow truncate text-left">
							<Trans>Search docs...</Trans>
						</span>
						<kbd className="text-[11px] font-medium text-muted-foreground">
							⌘K
						</kbd>
					</button>
				</div>
				<OverflowFadeContainer
					fadeEdges={["top", "bottom"]}
					className="flex flex-1 flex-col gap-7 overflow-y-auto px-4 pt-3 pb-8"
				>
					{sections.map((section) => (
						<div key={section.title}>
							<p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand-dark dark:text-brand-light">
								{section.title}
							</p>
							<div className="flex flex-col">
								{section.items.map((item) => (
									<AsideLink
										key={item.href}
										href={item.href}
										title={item.title}
									>
										<span className="block truncate">{item.title}</span>
									</AsideLink>
								))}
							</div>
						</div>
					))}
				</OverflowFadeContainer>
			</aside>
		</div>
	);
}
