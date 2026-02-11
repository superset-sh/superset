import { COMPANY } from "@superset/shared/constants";
import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { FaGithub } from "react-icons/fa";
import { GridCross } from "@/app/blog/components/GridCross";
import { getChangelogEntries } from "@/lib/changelog";
import { ChangelogEntry } from "./components/ChangelogEntry";

export const metadata: Metadata = {
	title: "Changelog",
	description:
		"The latest updates, improvements, and new features in Superset.",
	alternates: {
		canonical: "/changelog",
		types: {
			"application/rss+xml": "/changelog.xml",
		},
	},
	openGraph: {
		title: "Changelog | Superset",
		description:
			"The latest updates, improvements, and new features in Superset.",
		url: "/changelog",
		images: ["/opengraph-image"],
	},
	twitter: {
		card: "summary_large_image",
		title: "Changelog | Superset",
		description:
			"The latest updates, improvements, and new features in Superset.",
		images: ["/opengraph-image"],
	},
};

export default async function ChangelogPage() {
	const entries = getChangelogEntries();

	return (
		<main className="relative min-h-screen">
			{/* Vertical guide lines */}
			<div
				className="absolute inset-0 pointer-events-none"
				style={{
					backgroundImage: `
						linear-gradient(to right, transparent 0%, transparent calc(50% - 384px), rgba(255,255,255,0.06) calc(50% - 384px), rgba(255,255,255,0.06) calc(50% - 383px), transparent calc(50% - 383px), transparent calc(50% + 383px), rgba(255,255,255,0.06) calc(50% + 383px), rgba(255,255,255,0.06) calc(50% + 384px), transparent calc(50% + 384px))
					`,
				}}
			/>

			{/* Header section */}
			<header className="relative border-b border-border">
				<div className="max-w-3xl mx-auto px-6 pt-16 pb-10 md:pt-20 md:pb-12 relative">
					<GridCross className="top-0 left-0" />
					<GridCross className="top-0 right-0" />

					<span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
						Changelog
					</span>
					<h1 className="text-3xl md:text-4xl font-medium tracking-tight text-foreground mt-4">
						What's New
					</h1>
					<p className="text-muted-foreground mt-3 max-w-lg">
						The latest updates, improvements, and new features in Superset.
						Updated weekly. For detailed release notes, see{" "}
						<a
							href="https://github.com/superset-sh/superset/releases"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
						>
							GitHub Releases
							<ExternalLink className="h-3 w-3" />
						</a>
					</p>
					<a
						href={`${COMPANY.GITHUB_URL}/releases`}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mt-4"
					>
						<FaGithub className="size-4" />
						View releases on GitHub
						<span aria-hidden="true">&rarr;</span>
					</a>

					<GridCross className="bottom-0 left-0" />
					<GridCross className="bottom-0 right-0" />
				</div>
			</header>

			{/* Entries section */}
			<div className="relative max-w-3xl mx-auto px-6 py-16">
				{entries.length === 0 ? (
					<p className="text-muted-foreground">No updates yet.</p>
				) : (
					<div className="flex flex-col gap-16">
						{entries.map((entry) => (
							<ChangelogEntry key={entry.url} entry={entry} />
						))}
					</div>
				)}
			</div>
		</main>
	);
}
