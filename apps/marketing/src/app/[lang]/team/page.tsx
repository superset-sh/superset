import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { getI18nInstance } from "@superset/i18n/server";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { localeUrl, localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import { getAbout } from "@/lib/about";
import { getAllPeople } from "@/lib/people";
import { CompanyFacts } from "../components/CompanyFacts";
import { CTASection } from "../components/CTASection";
import { FounderRow } from "./components/FounderRow";
import { Investors } from "./components/Investors";
import { PhotoFan } from "./components/PhotoFan";
import { ProofLinks } from "./components/ProofLinks";
import { Timeline } from "./components/Timeline";

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	const i18n = getI18nInstance(lang);
	const title = i18n._(
		msg({
			message: "About",
		}),
	);
	const description = i18n._(
		msg({
			message:
				"What Superset is, who builds it, and who it's for. A San Francisco team, led by three ex-YC CTOs, building the workspace for parallel coding agents.",
		}),
	);
	const ogDescription = i18n._(
		msg({
			message:
				"Meet the team behind Superset, building parallel coding agents for developers.",
		}),
	);
	return {
		title,
		description,
		alternates: {
			canonical: localeUrl(lang, "/team"),
			languages: localizedAlternates(lang, "/team").languages,
		},
		openGraph: {
			title: `${title} | Superset`,
			description: ogDescription,
			url: localeUrl(lang, "/team"),
			images: ["/og-image.png"],
		},
		twitter: {
			card: "summary_large_image",
			title: `${title} | Superset`,
			description: ogDescription,
			images: ["/og-image.png"],
		},
	};
}

export default async function TeamPage() {
	const lang = await initServerI18n();

	const people = getAllPeople();
	const about = getAbout();
	const storyPhoto = about.photos.find((photo) => photo.story);

	return (
		<main className="relative min-h-screen bg-background">
			<div className="max-w-5xl mx-auto px-6 py-24 md:py-32">
				{/* Hero */}
				<section className="mb-12 md:mb-16">
					<p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground mb-6">
						<Trans>About Superset</Trans>
					</p>
					<h1 className="text-4xl sm:text-5xl md:text-6xl font-normal leading-[1.05] text-foreground max-w-4xl mb-8">
						<Trans>Building the last piece of software.</Trans>
					</h1>
					<p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-2xl">
						<Trans>
							Superset is building self-improving software. It starts with
							giving engineers the best tools that adapt to their needs over
							time. We're 3 ex-YC CTOs building a tool that we love.
						</Trans>
					</p>
				</section>

				<section className="mb-16 md:mb-20">
					<PhotoFan photos={about.photos} />
				</section>

				<CompanyFacts lang={lang} className="mb-24 md:mb-32" />

				{/* Our Story */}
				<section className="mb-24 md:mb-32">
					<div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-start">
						<div>
							<h2 className="text-2xl md:text-3xl font-normal text-foreground mb-6">
								<Trans>So how did we get here?</Trans>
							</h2>
							<div className="space-y-4 text-muted-foreground leading-relaxed">
								<p>
									<Trans>
										Superset started as a hackathon project in November 2025. It
										was a simple desktop app for managing worktrees.
									</Trans>
								</p>
								<p>
									<Trans>
										In just a few months,{" "}
										<span className="text-foreground">
											tens of thousands of engineers
										</span>{" "}
										run Superset as their primary IDE, at companies like Wix,
										DoorDash, and Netflix.
									</Trans>
								</p>
								<p>
									<Trans>
										Now, we've raised{" "}
										<span className="text-foreground">$11M</span> from the best
										investors in Silicon Valley to build the platform for
										software factories.
									</Trans>
								</p>
							</div>
						</div>
						{storyPhoto && (
							<figure className="m-0 md:sticky md:top-24">
								<div className="relative aspect-[8/5] rounded-lg overflow-hidden bg-muted border border-border">
									<Image
										src={storyPhoto.src}
										alt={storyPhoto.alt}
										fill
										className="object-cover"
										sizes="(max-width: 768px) 100vw, 480px"
									/>
								</div>
								<figcaption className="mt-3 text-xs text-muted-foreground">
									{storyPhoto.caption}
								</figcaption>
							</figure>
						)}
					</div>
				</section>

				<section className="mb-24 md:mb-32">
					<h2 className="text-2xl md:text-3xl font-normal text-foreground mb-3">
						<Trans>What we've shipped</Trans>
					</h2>
					<p className="text-muted-foreground mb-10 max-w-2xl">
						<Trans>
							From a hackathon project to the workspace for parallel coding
							agents.
						</Trans>
					</p>
					<Timeline entries={about.timeline} locale={lang} />
				</section>

				<section className="mb-24 md:mb-32">
					<h2 className="text-2xl md:text-3xl font-normal text-foreground mb-6">
						<Trans>The team</Trans>
					</h2>
					{people.length === 0 ? (
						<p className="text-muted-foreground">
							<Trans>No team members yet.</Trans>
						</p>
					) : (
						<div className="border-b border-border">
							{people.map((person) => (
								<FounderRow key={person.id} person={person} />
							))}
						</div>
					)}
				</section>

				<section className="mb-24 md:mb-32">
					<h2 className="text-2xl md:text-3xl font-normal text-foreground mb-3">
						<Trans>Backed by</Trans>
					</h2>
					<p className="text-muted-foreground mb-10 max-w-2xl">
						<Trans>
							Our $11M seed round is led by Union Square Ventures, with Y
							Combinator, Paul Graham, and founders we admire.
						</Trans>
					</p>
					<Investors investors={about.investors} />
				</section>

				<section className="mb-24 md:mb-32">
					<h2 className="text-2xl md:text-3xl font-normal text-foreground mb-3">
						<Trans>What we believe</Trans>
					</h2>
					<p className="mt-6 text-muted-foreground leading-relaxed">
						{about.belief}
					</p>
				</section>

				<section className="mb-24 md:mb-32">
					<h2 className="text-2xl md:text-3xl font-normal text-foreground mb-3">
						<Trans>See how we work</Trans>
					</h2>
					<p className="text-muted-foreground mb-10 max-w-2xl">
						<Trans>
							We build in public, so you can see how we work before you talk to
							us.
						</Trans>
					</p>
					<ProofLinks />
					<div className="mt-14">
						<Link
							href="/join-us"
							className="inline-flex items-center gap-2 text-foreground hover:text-foreground/80 transition-colors group"
						>
							<Trans>We're hiring in San Francisco</Trans>
							<ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
						</Link>
					</div>
				</section>
			</div>

			<CTASection />
		</main>
	);
}
