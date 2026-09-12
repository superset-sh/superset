"use client";

import { Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { useEffect, useState } from "react";

export interface ShowcaseNavItem {
	id: string;
	index: string;
	title: string;
}

interface ShowcaseNavProps {
	items: ShowcaseNavItem[];
}

export function ShowcaseNav({ items }: ShowcaseNavProps) {
	const [activeId, setActiveId] = useState(items[0]?.id);

	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				const visible = entries
					.filter((entry) => entry.isIntersecting)
					.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
				if (visible[0]) {
					setActiveId(visible[0].target.id);
				}
			},
			{ rootMargin: "-10% 0px -70% 0px" },
		);

		for (const item of items) {
			const el = document.getElementById(item.id);
			if (el) observer.observe(el);
		}
		return () => observer.disconnect();
	}, [items]);

	return (
		<nav className="sticky top-24 hidden self-start lg:block">
			<p className="mb-3 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
				<Trans>Sections</Trans>
			</p>
			<ul className="space-y-0.5 border-l border-border">
				{items.map((item) => (
					<li key={item.id}>
						<a
							href={`#${item.id}`}
							className={cn(
								"-ml-px flex items-baseline gap-2 border-l py-1 pl-4 text-sm transition-colors",
								activeId === item.id
									? "border-foreground text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground",
							)}
						>
							<span className="font-mono text-[10px]">{item.index}</span>
							{item.title}
						</a>
					</li>
				))}
			</ul>
		</nav>
	);
}
