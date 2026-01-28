import Link from "next/link";
import { MDXRemote } from "next-mdx-remote/rsc";
import {
	type ChangelogEntry as ChangelogEntryType,
	formatChangelogDate,
} from "@/lib/changelog-utils";
import { changelogMdxComponents } from "./changelog-mdx-components";

interface ChangelogEntryProps {
	entry: ChangelogEntryType;
}

export async function ChangelogEntry({ entry }: ChangelogEntryProps) {
	const formattedDate = formatChangelogDate(entry.date);

	return (
		<article
			id={`changelog-${entry.slug}`}
			className="relative border-b border-border pb-16 last:border-b-0"
		>
			{/* Sticky date label positioned to the left of the gridline */}
			<div
				className="hidden lg:flex absolute top-0 bottom-0 items-start"
				style={{ right: "calc(100% + 24px)" }}
			>
				<div className="sticky top-24 flex items-center gap-3 pt-1">
					<span className="text-sm font-mono text-muted-foreground whitespace-nowrap">
						{formattedDate}
					</span>
					<div className="w-0.5 h-5 bg-orange-500" />
				</div>
			</div>

			{/* Mobile date */}
			<time
				dateTime={entry.date}
				className="lg:hidden block text-sm font-mono text-muted-foreground mb-4"
			>
				{formattedDate}
			</time>

			{/* Title */}
			<Link href={entry.url} className="group">
				<h2 className="text-2xl md:text-3xl font-medium text-foreground mb-4 group-hover:text-foreground/80 transition-colors">
					{entry.title}
				</h2>
			</Link>

			{/* Featured image */}
			{entry.image && (
				<div className="relative mb-6 overflow-hidden border border-border">
					{/* biome-ignore lint/performance/noImgElement: Need native img for natural dimensions */}
					<img src={entry.image} alt={entry.title} className="w-full h-auto" />
				</div>
			)}

			{/* Description */}
			{entry.description && (
				<p className="text-lg text-muted-foreground mb-6">
					{entry.description}
				</p>
			)}

			{/* Full MDX content */}
			<div className="prose prose-invert max-w-none prose-headings:font-medium prose-headings:tracking-tight prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-4 prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-3 prose-p:text-muted-foreground prose-p:leading-relaxed prose-li:text-muted-foreground prose-strong:text-foreground prose-a:text-foreground prose-a:underline prose-a:underline-offset-4 hover:prose-a:text-muted-foreground prose-hr:border-border prose-hr:my-8">
				<MDXRemote source={entry.content} components={changelogMdxComponents} />
			</div>
		</article>
	);
}
