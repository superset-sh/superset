import { formatDate } from "@superset/i18n/format";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { About } from "@/lib/about";

interface TimelineProps {
	entries: About["timeline"];
	locale: string;
}

export function Timeline({ entries, locale }: TimelineProps) {
	return (
		<ol className="border-l border-border">
			{entries.map((entry) => {
				const month = formatDate(
					entry.date,
					{ month: "short", year: "numeric", timeZone: "UTC" },
					locale,
				);

				return (
					<li
						key={`${entry.date.toISOString()}-${entry.title}`}
						className="relative grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-1 sm:gap-6 pl-6 py-3"
					>
						<span className="absolute -left-[4.5px] top-[1.15rem] size-2 rounded-full bg-muted-foreground/50" />
						<time
							dateTime={entry.date.toISOString()}
							className="font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground pt-1"
						>
							{month}
						</time>
						{entry.href ? (
							<Link
								href={entry.href}
								{...(entry.href.startsWith("http") && {
									target: "_blank",
									rel: "noopener noreferrer",
								})}
								className="group inline-flex items-start gap-1 text-foreground hover:text-foreground/80 transition-colors"
							>
								{entry.title}
								<ArrowUpRight className="size-4 mt-1 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
							</Link>
						) : (
							<span className="text-foreground">{entry.title}</span>
						)}
					</li>
				);
			})}
		</ol>
	);
}
