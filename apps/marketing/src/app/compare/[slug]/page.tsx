import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { mdxComponents } from "@/app/blog/components/mdx-components";
import { ComparisonJsonLd } from "@/components/JsonLd";
import { getAllComparisonSlugs, getComparisonPage } from "@/lib/compare";
import { CompareLayout } from "./components/CompareLayout";

interface PageProps {
	params: Promise<{ slug: string }>;
}

export default async function ComparePageRoute({ params }: PageProps) {
	const { slug } = await params;
	const page = getComparisonPage(slug);

	if (!page) {
		notFound();
	}

	const url = `${COMPANY.MARKETING_URL}/compare/${slug}`;

	return (
		<main>
			<ComparisonJsonLd
				title={page.title}
				description={page.description}
				publishedTime={new Date(page.date).toISOString()}
				modifiedTime={
					page.lastUpdated
						? new Date(page.lastUpdated).toISOString()
						: undefined
				}
				url={url}
				image={page.image}
			/>
			<CompareLayout page={page}>
				<MDXRemote
					source={page.content}
					components={mdxComponents}
					options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }}
				/>
			</CompareLayout>
		</main>
	);
}

export async function generateStaticParams() {
	return getAllComparisonSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { slug } = await params;
	const page = getComparisonPage(slug);

	if (!page) {
		return {};
	}

	const url = `${COMPANY.MARKETING_URL}/compare/${slug}`;

	return {
		title: `${page.title} | ${COMPANY.NAME}`,
		description: page.description,
		alternates: {
			canonical: url,
		},
		openGraph: {
			title: page.title,
			description: page.description,
			type: "article",
			url,
			siteName: COMPANY.NAME,
			publishedTime: page.date,
			modifiedTime: page.lastUpdated ?? page.date,
			...(page.image && { images: [page.image] }),
		},
		twitter: {
			card: "summary_large_image",
			title: page.title,
			description: page.description,
			...(page.image && { images: [page.image] }),
		},
	};
}
