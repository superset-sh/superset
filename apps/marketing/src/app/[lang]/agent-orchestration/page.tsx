import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryArticle } from "@/app/[lang]/components/CategoryArticle";
import { localeUrl, localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import { getCategoryPage } from "@/lib/category";

const SLUG = "agent-orchestration";

export default async function AgentOrchestrationPage() {
	await initServerI18n();

	const page = getCategoryPage(SLUG);

	if (!page) {
		notFound();
	}

	return <CategoryArticle page={page} />;
}

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	const page = getCategoryPage(SLUG);

	if (!page) {
		return {};
	}

	const url = localeUrl(lang, `/${SLUG}`);

	return {
		title: `${page.title} | ${COMPANY.NAME}`,
		description: page.description,
		...(page.keywords.length > 0 && { keywords: page.keywords }),
		alternates: localizedAlternates(lang, `/${SLUG}`),
		openGraph: {
			title: page.title,
			description: page.description,
			type: "article",
			url,
			siteName: COMPANY.NAME,
			publishedTime: page.date,
			modifiedTime: page.lastUpdated ?? page.date,
		},
		twitter: {
			card: "summary_large_image",
			title: page.title,
			description: page.description,
		},
	};
}
