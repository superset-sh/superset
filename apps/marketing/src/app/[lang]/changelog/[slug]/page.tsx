import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { localeUrl, localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import { ArticleJsonLd, BreadcrumbJsonLd } from "@/components/JsonLd";
import { getAllChangelogSlugs, getChangelogEntry } from "@/lib/changelog";
import { changelogMdxComponents } from "../components/ChangelogEntry/changelog-mdx-components";
import { ChangelogEntryLayout } from "./components/ChangelogEntryLayout";

interface PageProps {
	params: Promise<{ slug: string }>;
}

export default async function ChangelogEntryPage({ params }: PageProps) {
	const lang = await initServerI18n();

	const { slug } = await params;
	const entry = getChangelogEntry(slug);

	if (!entry) {
		notFound();
	}

	const url = localeUrl(lang, `/changelog/${slug}`);

	return (
		<main>
			<ArticleJsonLd
				title={entry.title}
				description={entry.description}
				author={{ name: "Superset Team" }}
				publishedTime={new Date(entry.date).toISOString()}
				url={url}
				image={entry.image}
			/>
			<BreadcrumbJsonLd
				items={[
					{ name: "Home", url: COMPANY.MARKETING_URL },
					{ name: "Changelog", url: `${COMPANY.MARKETING_URL}/changelog` },
					{ name: entry.title, url },
				]}
			/>
			<ChangelogEntryLayout entry={entry}>
				<MDXRemote source={entry.content} components={changelogMdxComponents} />
			</ChangelogEntryLayout>
		</main>
	);
}

export async function generateStaticParams() {
	return getAllChangelogSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const lang = await initServerI18n();
	const { slug } = await params;
	const entry = getChangelogEntry(slug);

	if (!entry) {
		return {};
	}

	const url = `${COMPANY.MARKETING_URL}/changelog/${slug}`;

	return {
		title: entry.title,
		description: entry.description,
		alternates: localizedAlternates(lang, `/changelog/${slug}`),
		openGraph: {
			title: entry.title,
			description: entry.description,
			type: "article",
			url,
			siteName: COMPANY.NAME,
			publishedTime: entry.date,
		},
		twitter: {
			card: "summary_large_image",
			title: entry.title,
			description: entry.description,
		},
	};
}
