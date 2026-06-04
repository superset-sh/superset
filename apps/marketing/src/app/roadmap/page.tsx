import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { GridCross } from "@/app/blog/components/GridCross";
import { RoadmapBoard } from "./components/RoadmapBoard";

export const metadata: Metadata = {
	title: "Roadmap",
	description:
		"See what we're building now, what's coming next, and where Superset is headed.",
	alternates: {
		canonical: "/roadmap",
	},
	openGraph: {
		title: "Roadmap | Superset",
		description:
			"See what we're building now, what's coming next, and where Superset is headed.",
		url: "/roadmap",
		images: ["/opengraph-image"],
	},
	twitter: {
		card: "summary_large_image",
		title: "Roadmap | Superset",
		description:
			"See what we're building now, what's coming next, and where Superset is headed.",
		images: ["/opengraph-image"],
	},
};

export default function RoadmapPage() {
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
						Roadmap
					</span>
					<h1 className="text-3xl md:text-4xl font-medium tracking-tight text-foreground mt-4">
						What We're Building
					</h1>
					<p className="text-muted-foreground mt-3 max-w-lg">
						A look at what's in progress, what's coming next, and where{" "}
						{COMPANY.NAME} is headed. Priorities may shift as we learn more.
					</p>

					<GridCross className="bottom-0 left-0" />
					<GridCross className="bottom-0 right-0" />
				</div>
			</header>

			{/* Content */}
			<div className="relative max-w-5xl mx-auto px-6 py-12 md:py-16">
				<RoadmapBoard />
			</div>
		</main>
	);
}
