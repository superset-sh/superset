import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { getAllLegalSlugs, getLegalPage } from "@/lib/legal";

interface PageProps {
	params: Promise<{ slug: string }>;
}

function formatDate(date: string | Date): string {
	return new Date(date).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

export default async function LegalPage({ params }: PageProps) {
	const { slug } = await params;
	const page = getLegalPage(slug);

	if (!page) {
		notFound();
	}

	return (
		<main className="bg-background pt-24 pb-16 min-h-screen">
			<article className="max-w-3xl mx-auto px-6 sm:px-8">
				<header className="border-b border-border pb-8 mb-10">
					<h1 className="text-3xl sm:text-4xl font-medium text-foreground">
						{page.title}
					</h1>
					<p className="mt-4 text-sm text-muted-foreground">
						Last updated: {formatDate(page.lastUpdated)}
					</p>
				</header>

				<div className="prose max-w-none">
					<MDXRemote
						source={page.content}
						options={{
							mdxOptions: {
								remarkPlugins: [remarkGfm],
							},
						}}
					/>
				</div>
			</article>
		</main>
	);
}

export async function generateStaticParams() {
	return getAllLegalSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { slug } = await params;
	const page = getLegalPage(slug);

	if (!page) {
		return {};
	}

	return {
		title: `${page.title} - Superset`,
		description: page.description,
	};
}
