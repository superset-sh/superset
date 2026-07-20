import { OPEN_ROLES } from "@superset/shared/constants";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";

const DESCRIPTION =
	"We're hiring engineers in San Francisco. Help us build the first software factory platform.";

export const metadata: Metadata = {
	title: "Join us",
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
			<div className="max-w-3xl mx-auto px-6 py-24 md:py-32">
				<section>
					<h1 className="text-4xl sm:text-5xl md:text-6xl font-normal leading-none text-foreground -mb-[0.2em]">
						Join us at{" "}
						<span
							className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl ml-2 font-light leading-none tracking-wide"
							style={{ fontFamily: "var(--font-micro5)" }}
						>
							SUPERSET
						</span>
					</h1>

					<p className="text-base text-muted-foreground leading-relaxed mb-6">
						{DESCRIPTION}
					</p>

					<a
						href="#open-roles"
						className="inline-flex items-center gap-2 border border-border bg-background px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted group"
					>
						See open roles
						<ArrowDown className="size-4 transition-transform group-hover:translate-y-0.5" />
					</a>
				</section>

				<section className="mt-6">
					<div className="space-y-5 text-lg text-muted-foreground leading-relaxed">
						<p>
							Superset started as a hackathon project in November 2025. It was a
							simple desktop app for managing worktrees.
						</p>

						<p>
							It wasn't much to start, but today,{" "}
							<span className="text-foreground">
								tens of thousands of engineers
							</span>{" "}
							run Superset as their primary IDE, at companies like Vercel, Exa,
							and Ramp.
						</p>

						<p>
							Now, we&apos;ve raised{" "}
							<span className="text-foreground">$11M</span> from the best
							investors in Silicon Valley to build the platform for software
							factories.
						</p>
					</div>

					<figure className="m-0 mt-10 md:mt-12">
						{/* biome-ignore lint/performance/noImgElement: static asset with known dimensions */}
						<img
							src="/join-us/founders.jpg"
							alt="The Superset founders at a Hackathon, YC HQ San Francisco"
							width={1536}
							height={960}
							className="w-full rounded-lg border border-border"
						/>

						<figcaption className="mt-3 text-xs text-muted-foreground">
							The founders at a hackathon{" "}
							<span className="text-muted-foreground/40">|</span> YC HQ,
							November 2025
						</figcaption>
					</figure>
				</section>

				<section className="mt-12 md:mt-16">
					<h2 className="text-2xl md:text-3xl font-normal text-foreground mb-6">
						What's a software factory?
					</h2>

					<div className="space-y-5 text-lg text-muted-foreground leading-relaxed">
						<p>
							Software engineering has changed dramatically since we started:
						</p>

						<ul className="list-disc space-y-2 pl-6">
							<li>We barely open a full IDE anymore</li>
							<li>
								Agents write most of the code (humans still review most of it)
							</li>
							<li>People are parallelizing work for the first time</li>
						</ul>

						<p>
							We saw this coming - coding was becoming increasingly agentic, and
							the existing tooling wasn't catching up. That's why we built
							Superset.
						</p>

						<p>
							And this trend is{" "}
							<em className="text-foreground">accelerating</em>. Today, folks
							are running 3-5 agents in parallel, and soon it will be 100s.
						</p>

						<p>
							Follow that trajectory and you get the first bona fide{" "}
							<span className="text-foreground">software factories</span>:
							engines that autonomously manufacture and ship code, powered by
							hundreds of agents running at once.
						</p>
						<p>
							Our current model of writing code just won't scale there. How will
							a human understand what's going on? How will our infrastructure
							handle that much code being generated?
						</p>
						<p>
							So much of our software infrastructure needs to be thrown out and
							rebuilt. This is a land grab - value is about to be created at a
							scale we've never seen. We intend to claim it by making Superset
							the place where teams run and manage their coding factories -{" "}
							<span className="text-foreground">starting with our own.</span>
						</p>
					</div>
				</section>

				<section className="mt-12 md:mt-16">
					<h2 className="text-2xl md:text-3xl font-normal text-foreground mb-6">
						We build our own toys
					</h2>

					<div className="space-y-5 text-lg text-muted-foreground leading-relaxed">
						<p>
							Superset is built in Superset, so we're our own #1 users. When
							something's annoying, we feel it first; when something's magical,
							we can't wait to share it.
						</p>

						<p>
							That's the hidden perk of working here: you get paid to make your
							own life easier. If the platform we're building is fun and makes
							us 10x more productive, chances are everyone else will love it
							too.
						</p>

						<p className="text-foreground">
							If you've ever wanted to build a product you love to use, come
							build it with us.
						</p>
					</div>
				</section>

				<section id="open-roles" className="mt-12 md:mt-16 scroll-mt-24">
					<h2 className="text-2xl md:text-3xl font-normal text-foreground mb-6">
						Open roles
					</h2>

					<ul className="m-0 list-none p-0 border-t border-border">
						{OPEN_ROLES.map((role) => (
							<li key={role.title} className="border-b border-border">
								<a
									href={role.url}
									target="_blank"
									rel="noopener noreferrer"
									className="group flex items-center justify-between gap-4 py-5 no-underline"
								>
									<span className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
										<span className="text-lg text-foreground">
											{role.title}
										</span>
										<span className="text-sm text-muted-foreground">
											{role.location}
										</span>
									</span>
									<ArrowUpRight className="size-5 shrink-0 text-muted-foreground transition-all group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
								</a>
							</li>
						))}
					</ul>
				</section>
			</div>
		</main>
	);
}
