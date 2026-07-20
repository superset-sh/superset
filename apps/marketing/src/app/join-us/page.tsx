import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { ApplyCard } from "./components/ApplyCard";

const DESCRIPTION =
	"We've raised $11M from the best investors out there and we're now hiring engineers and designers in San Francisco. Join three former founders building the software factory platform.";

export const metadata: Metadata = {
	title: "Join us",
	description: DESCRIPTION,
	alternates: {
		canonical: "/join-us",
	},
	openGraph: {
		title: "Join us at Superset",
		description: DESCRIPTION,
		url: "/join-us",
		images: ["/opengraph-image"],
	},
	twitter: {
		card: "summary_large_image",
		title: "Join us at Superset",
		description: DESCRIPTION,
		images: ["/opengraph-image"],
	},
};

export default function JoinUsPage() {
	return (
		<main className="relative min-h-screen bg-background">
			<div className="max-w-5xl mx-auto px-6 py-24 md:py-32">
				<h1 className="text-4xl sm:text-5xl md:text-6xl font-normal text-foreground mb-6">
					Join us at Superset
				</h1>

				<div className="mt-6">
					<ApplyCard
						title="Apply to join us"
						description="We're looking for exceptional engineers and designers to work with us in SF."
					/>
				</div>

				<section className="mt-12 md:mt-16 grid grid-cols-1 items-center gap-10 md:grid-cols-5">
					<div className="md:col-span-2 space-y-5 text-foreground leading-relaxed">
						<p>
							Superset started as a hackathon project in November 2025. It was a
							simple desktop app for managing worktrees.
						</p>

						<p>
							It wasn't much to start, but today, tens of thousands of engineers
							run Superset as their primary IDE, at companies like Vercel, Exa,
							and Ramp.
						</p>
						<p>
							Next, we&apos;ve raised $11M from the best investors in Silicon
							Valley to build the platform for software factories.
						</p>
					</div>

					<figure className="m-0 md:col-span-3">
						{/* biome-ignore lint/performance/noImgElement: static asset with known dimensions */}
						<img
							src="/join-us/founders.jpg"
							alt="The Superset founders at a Hackathon, YC HQ San Francisco"
							width={1536}
							height={960}
							className="w-full rounded-lg border border-border"
						/>

						<figcaption className="mt-3 text-right text-xs text-muted-foreground">
							The founders at a hackathon{" "}
							<span className="text-muted-foreground/40">|</span> YC HQ,
							November 2025
						</figcaption>
					</figure>
				</section>

				<section className="mt-20 md:mt-28 space-y-5 text-foreground leading-relaxed">
					<h2 className="text-2xl md:text-3xl font-normal text-foreground">
						Building a software factory
					</h2>

					<p className="max-w-3xl">Coding agents can now</p>
				</section>

				<div className="mt-6">
					<ApplyCard
						title="Apply to join us"
						description="We're looking for exceptional engineers and designers to work with us in SF."
					/>
				</div>
			</div>
		</main>
	);
}
