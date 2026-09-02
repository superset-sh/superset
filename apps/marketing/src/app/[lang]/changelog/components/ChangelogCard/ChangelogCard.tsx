import Image from "next/image";
import Link from "next/link";
import {
	type ChangelogEntry,
	formatChangelogDate,
} from "@/lib/changelog-utils";

interface ChangelogCardProps {
	entry: ChangelogEntry;
}

export function ChangelogCard({ entry }: ChangelogCardProps) {
	const formattedDate = formatChangelogDate(entry.date);

	return (
		<Link href={entry.url} className="block group">
			<article className="border border-border bg-background transition-all hover:bg-muted/50 hover:border-foreground/20">
				{entry.image && (
					<div className="relative aspect-video border-b border-border overflow-hidden">
						<Image
							src={entry.image}
							alt={entry.title}
							fill
							className="object-cover transition-transform group-hover:scale-[1.02]"
						/>
					</div>
				)}
				<div className="p-6">
					<time
						dateTime={entry.date}
						className="text-sm font-mono text-muted-foreground"
					>
						{formattedDate}
					</time>
					<h2 className="text-xl font-medium text-foreground mt-2 mb-2 group-hover:text-foreground/90">
						{entry.title}
					</h2>
					{entry.description && (
						<p className="text-muted-foreground text-sm leading-relaxed">
							{entry.description}
						</p>
					)}
				</div>
			</article>
		</Link>
	);
}
