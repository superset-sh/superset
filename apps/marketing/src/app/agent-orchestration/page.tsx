import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryArticle } from "@/app/components/CategoryArticle";
import { getCategoryPage } from "@/lib/category";

const SLUG = "agent-orchestration";

export default function AgentOrchestrationPage() {
	const page = getCategoryPage(SLUG);

	if (!page) {
		notFound();
	}

	return <CategoryArticle page={page} />;
}

export function generateMetadata(): Metadata {
	const page = getCategoryPage(SLUG);

	if (!page) {
		return {};
	}

	const url = `${COMPANY.MARKETING_URL}/${SLUG}`;

	return {
		title: `${page.title} | ${COMPANY.NAME}`,
		description: page.description,
		...(page.keywords.length > 0 && { keywords: page.keywords }),
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
		},
		twitter: {
			card: "summary_large_image",
			title: page.title,
			description: page.description,
		},
	};
}
