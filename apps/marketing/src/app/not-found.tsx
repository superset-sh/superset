import { Trans, useLingui } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import Link from "next/link";
import { initServerI18n } from "@/app/i18n-server";
import { NotFoundGrid } from "./components/NotFoundGrid";
import { Pixel404 } from "./components/Pixel404";

export const metadata: Metadata = {
	title: "Page Not Found",
	robots: { index: false },
};

export default async function NotFound() {
	await initServerI18n();

	const { t } = useLingui();

	return (
		<main className="relative bg-background min-h-[calc(100vh-3.5rem)] flex items-center overflow-hidden">
			<NotFoundGrid />

			<div className="relative z-10 w-full max-w-6xl mx-auto px-6 sm:px-8 lg:px-12 flex flex-col lg:flex-row items-center gap-12 lg:gap-20 py-24">
				<div className="flex-1 flex items-center justify-center">
					<Pixel404 />
				</div>

				<div className="flex-1 max-w-md space-y-6">
					<h1 className="text-3xl sm:text-4xl font-medium text-foreground">
						<Trans id="marketing.notFound.title">Page not found</Trans>
					</h1>
					<p className="text-sm sm:text-base font-light text-muted-foreground leading-relaxed">
						<Trans id="marketing.notFound.body">
							The page you&apos;re looking for doesn&apos;t exist or has been
							moved.
						</Trans>
					</p>
					<Link
						href="/"
						className="inline-flex items-center gap-2 mt-2 px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-normal border border-border text-foreground hover:bg-muted transition-colors"
					>
						<Trans id="marketing.notFound.takeMeHome">Take me home</Trans>
					</Link>
					<nav
						aria-label={t({
							id: "marketing.notFound.whereToLookNext",
							message: "Where to look next",
						})}
					>
						<p className="text-xs font-mono text-muted-foreground mb-2">
							<Trans id="marketing.notFound.whereToLookNext">
								Where to look next
							</Trans>
						</p>
						<ul className="text-sm text-muted-foreground space-y-1">
							<li>
								<a href={COMPANY.DOCS_URL} className="hover:text-foreground">
									<Trans id="marketing.notFound.links.docs">
										Documentation
									</Trans>
								</a>
							</li>
							<li>
								<Link href="/blog" className="hover:text-foreground">
									<Trans id="marketing.notFound.links.blog">Blog</Trans>
								</Link>
							</li>
							<li>
								<Link href="/changelog" className="hover:text-foreground">
									<Trans id="marketing.notFound.links.changelog">
										Changelog
									</Trans>
								</Link>
							</li>
							<li>
								<a href="/sitemap.xml" className="hover:text-foreground">
									<Trans id="marketing.notFound.links.sitemap">Sitemap</Trans>
								</a>
							</li>
							<li>
								<a href="/llms.txt" className="hover:text-foreground">
									<Trans id="marketing.notFound.links.llmsTxt">
										llms.txt (index for AI agents)
									</Trans>
								</a>
							</li>
						</ul>
					</nav>
				</div>
			</div>
		</main>
	);
}
