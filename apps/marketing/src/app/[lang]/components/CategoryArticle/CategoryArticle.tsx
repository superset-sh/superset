import { Trans } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import Link from "next/link";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { GridCross } from "@/app/[lang]/blog/components/GridCross";
import { mdxComponents } from "@/app/[lang]/blog/components/mdx-components";
import {
	ArticleJsonLd,
	BreadcrumbJsonLd,
	FAQPageJsonLd,
} from "@/components/JsonLd";
import type { CategoryPage } from "@/lib/category";
import { extractComparisonFaqItems } from "@/lib/compare-utils";
import { formatContentDate } from "@/lib/content-utils";

interface CategoryArticleProps {
	page: CategoryPage;
}

export function CategoryArticle({ page }: CategoryArticleProps) {
	const url = `${COMPANY.MARKETING_URL}${page.url}`;
	const faqItems = extractComparisonFaqItems(page.content);
	const formattedDate = formatContentDate(
		page.lastUpdated ?? page.date,
		"short",
	);

	return (
		<main>
			<ArticleJsonLd
				title={page.title}
				description={page.description}
				author={{ name: COMPANY.NAME, url: COMPANY.MARKETING_URL }}
				publishedTime={new Date(page.date).toISOString()}
				modifiedTime={new Date(page.lastUpdated ?? page.date).toISOString()}
				url={url}
			/>
			<BreadcrumbJsonLd
				items={[
					{ name: "Home", url: COMPANY.MARKETING_URL },
					{ name: page.title, url },
				]}
			/>
			{faqItems.length > 0 && <FAQPageJsonLd items={faqItems} />}
			<article className="relative min-h-screen">
				<header className="relative border-b border-border">
					<div className="max-w-3xl mx-auto px-6 pt-16 pb-10 md:pt-20 md:pb-12">
						<GridCross className="top-0 left-0" />
						<GridCross className="top-0 right-0" />

						<div className="text-center">
							<span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
								<Trans>Guide</Trans>
							</span>

							<h1 className="text-3xl md:text-4xl lg:text-5xl font-medium tracking-tight text-foreground mt-4 mb-4">
								{page.title}
							</h1>

							{page.description && (
								<p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto mb-6">
									{page.description}
								</p>
							)}

							<div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
								<span>
									<Trans>Last updated</Trans>
								</span>
								<span className="text-muted-foreground/50">·</span>
								<time dateTime={page.lastUpdated ?? page.date}>
									{formattedDate}
								</time>
							</div>
						</div>
					</div>

					<div className="max-w-3xl mx-auto px-6 relative">
						<GridCross className="bottom-0 left-0" />
						<GridCross className="bottom-0 right-0" />
					</div>
				</header>

				<div className="relative max-w-3xl mx-auto px-6 py-12">
					<div className="prose max-w-none">
						<MDXRemote
							source={page.content}
							components={mdxComponents}
							options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }}
						/>
					</div>
				</div>

				<footer className="relative border-t border-border">
					<div className="max-w-3xl mx-auto px-6 relative">
						<GridCross className="top-0 left-0" />
						<GridCross className="top-0 right-0" />
					</div>
					<div className="max-w-3xl mx-auto px-6 py-10 text-center">
						<p className="text-muted-foreground mb-4">
							<Trans>Ready to try Superset?</Trans>
						</p>
						<Link
							href="/"
							className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-foreground/80 transition-colors border border-border rounded-md px-4 py-2"
						>
							<Trans>Get started</Trans>
						</Link>
					</div>
				</footer>
			</article>
		</main>
	);
}
