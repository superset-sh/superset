import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import Link from "next/link";

import { NotFoundGrid } from "./components/NotFoundGrid";
import { Pixel404 } from "./components/Pixel404";

export const metadata: Metadata = {
	title: "Page Not Found",
	robots: { index: false },
};

export default function NotFound() {
	return (
		<main className="relative bg-background min-h-[calc(100vh-3.5rem)] flex items-center overflow-hidden">
			<NotFoundGrid />

			<div className="relative z-10 w-full max-w-6xl mx-auto px-6 sm:px-8 lg:px-12 flex flex-col lg:flex-row items-center gap-12 lg:gap-20 py-24">
				<div className="flex-1 flex items-center justify-center">
					<Pixel404 />
				</div>

				<div className="flex-1 max-w-md space-y-6">
					<h1 className="text-3xl sm:text-4xl font-medium text-foreground">
						Page not found
					</h1>
					<p className="text-sm sm:text-base font-light text-muted-foreground leading-relaxed">
						The page you&apos;re looking for doesn&apos;t exist or has been
						moved.
					</p>
					<Link
						href="/"
						className="inline-flex items-center gap-2 mt-2 px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-normal border border-border text-foreground hover:bg-muted transition-colors"
					>
						Take me home
					</Link>
					<nav aria-label="Where to look next">
						<p className="text-xs font-mono text-muted-foreground mb-2">
							Where to look next
						</p>
						<ul className="text-sm text-muted-foreground space-y-1">
							<li>
								<a href={COMPANY.DOCS_URL} className="hover:text-foreground">
									Documentation
								</a>
							</li>
							<li>
								<Link href="/blog" className="hover:text-foreground">
									Blog
								</Link>
							</li>
							<li>
								<Link href="/changelog" className="hover:text-foreground">
									Changelog
								</Link>
							</li>
							<li>
								<a href="/sitemap.xml" className="hover:text-foreground">
									Sitemap
								</a>
							</li>
							<li>
								<a href="/llms.txt" className="hover:text-foreground">
									llms.txt (index for AI agents)
								</a>
							</li>
						</ul>
					</nav>
				</div>
			</div>
		</main>
	);
}
