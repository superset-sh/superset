import Image from "next/image";
import Link from "next/link";
import { MDXRemote } from "next-mdx-remote/rsc";
import { mdxComponents } from "@/app/blog/components/mdx-components";
import {
	type ChangelogEntry as ChangelogEntryType,
	formatChangelogDate,
} from "@/lib/changelog-utils";

interface ChangelogEntryProps {
	entry: ChangelogEntryType;
}

export async function ChangelogEntry({ entry }: ChangelogEntryProps) {
	const formattedDate = formatChangelogDate(entry.date);

	return (
		<article className="border-b border-border pb-16 last:border-b-0">
			{/* Date */}
			<time
				dateTime={entry.date}
				className="block text-sm font-mono text-muted-foreground mb-4"
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
				<div className="relative aspect-video mb-6 overflow-hidden border border-border rounded-lg">
					<Image
						src={entry.image}
						alt={entry.title}
						fill
						className="object-cover"
					/>
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
				<MDXRemote source={entry.content} components={mdxComponents} />
			</div>
		</article>
	);
}
