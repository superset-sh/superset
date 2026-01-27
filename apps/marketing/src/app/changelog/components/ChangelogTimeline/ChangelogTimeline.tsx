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
		<nav className="hidden lg:block sticky top-24 self-start w-48 shrink-0">
			<div className="relative pl-4">
				{/* Vertical line */}
				<div className="absolute left-0 top-0 bottom-0 w-px bg-border" />

				<ul className="space-y-4">
					{entries.map((entry) => {
						const isActive = activeSlug === entry.slug;
						return (
							<li key={entry.slug} className="relative">
								{/* Dot indicator */}
								<div
									className={`absolute -left-4 top-1 w-2 h-2 rounded-full transition-colors ${
										isActive ? "bg-foreground" : "bg-muted-foreground/40"
									}`}
									style={{ transform: "translateX(-50%)" }}
								/>

								<button
									type="button"
									onClick={() => scrollToEntry(entry.slug)}
									className={`text-left transition-colors ${
										isActive
											? "text-foreground"
											: "text-muted-foreground hover:text-foreground/70"
									}`}
								>
									<span className="block text-xs font-mono">
										{formatChangelogDate(entry.date)}
									</span>
								</button>
							</li>
						);
					})}
				</ul>
			</div>
		</nav>
	);
}
