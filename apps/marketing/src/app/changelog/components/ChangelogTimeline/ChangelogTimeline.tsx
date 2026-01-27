"use client";

import { useEffect, useState } from "react";
import { formatChangelogDate } from "@/lib/changelog-utils";

interface TimelineEntry {
	slug: string;
	date: string;
	title: string;
}

interface ChangelogTimelineProps {
	entries: TimelineEntry[];
}

export function ChangelogTimeline({ entries }: ChangelogTimelineProps) {
	const [activeSlug, setActiveSlug] = useState<string | null>(
		entries[0]?.slug ?? null,
	);

	useEffect(() => {
		const handleScroll = () => {
			const entryElements = entries
				.map((entry) => ({
					slug: entry.slug,
					element: document.getElementById(`changelog-${entry.slug}`),
				}))
				.filter((item) => item.element !== null);

			const viewportMiddle = window.innerHeight / 3;

			for (const { slug, element } of entryElements) {
				if (!element) continue;
				const rect = element.getBoundingClientRect();
				if (rect.top <= viewportMiddle && rect.bottom > viewportMiddle) {
					setActiveSlug(slug);
					break;
				}
			}
		};

		window.addEventListener("scroll", handleScroll, { passive: true });
		handleScroll();

		return () => window.removeEventListener("scroll", handleScroll);
	}, [entries]);

	const scrollToEntry = (slug: string) => {
		const element = document.getElementById(`changelog-${slug}`);
		if (element) {
			const headerOffset = 100;
			const elementPosition = element.getBoundingClientRect().top;
			const offsetPosition =
				elementPosition + window.pageYOffset - headerOffset;

			window.scrollTo({
				top: offsetPosition,
				behavior: "smooth",
			});
		}
	};

	return (
		<nav className="sticky top-24 self-start h-fit">
			<ul className="space-y-6">
				{entries.map((entry) => {
					const isActive = activeSlug === entry.slug;
					return (
						<li key={entry.slug} className="relative flex items-center gap-3 pt-2">
							{/* Date text */}
							<button
								type="button"
								onClick={() => scrollToEntry(entry.slug)}
								className={`flex-1 text-right transition-colors ${
									isActive
										? "text-foreground"
										: "text-muted-foreground hover:text-foreground/70"
								}`}
							>
								<span className="block text-sm font-mono">
									{formatChangelogDate(entry.date)}
								</span>
							</button>

							{/* Vertical line indicator - sits on the gridline */}
							<div
								className={`shrink-0 w-0.5 h-5 transition-colors ${
									isActive ? "bg-orange-500" : "bg-muted-foreground/40"
								}`}
							/>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
