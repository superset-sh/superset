import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
	RiGithubFill,
	RiLinkedinBoxFill,
	RiTwitterXFill,
} from "react-icons/ri";
import { localeUrl, localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import { getAllPeople } from "@/lib/people";
import { CTASection } from "../components/CTASection";
import { TeamBio } from "./components/TeamBio";

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	const title = i18n._(
		msg({
			message: "About",
		}),
	);
	const description = i18n._(
		msg({
			message:
				"What Superset is, who builds it, and who it's for. A San Francisco team of three ex-YC CTOs building the workspace for parallel coding agents.",
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
			images: ["/opengraph-image"],
		},
		twitter: {
			card: "summary_large_image",
			title: `${title} | Superset`,
			description: ogDescription,
			images: ["/opengraph-image"],
		},
	};
}

export default async function TeamPage() {
	await initServerI18n();

	const { t } = useLingui();
	const people = getAllPeople();

	return (
		<main className="relative min-h-screen bg-background">
			<div className="max-w-5xl mx-auto px-6 py-24 md:py-32">
				{/* Hero */}
				<section className="mb-24 md:mb-32">
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
						<figure className="m-0 md:sticky md:top-24">
							<div className="relative aspect-[8/5] rounded-lg overflow-hidden bg-muted border border-border">
								<Image
									src="/join-us/founders.jpg"
									alt={t({
										message:
											"The Superset founders at a hackathon, YC HQ San Francisco",
									})}
									fill
									className="object-cover"
									sizes="(max-width: 768px) 100vw, 480px"
								/>
							</div>
							<figcaption className="mt-3 text-xs text-muted-foreground">
								<Trans>
									The founders at the hackathon where Superset started{" "}
									<span className="text-muted-foreground/40">|</span> YC HQ,
									November 2025
								</Trans>
							</figcaption>
						</figure>
					</div>
				</section>

				{/* Founders Grid */}
				<section className="mb-24 md:mb-32">
					<h2 className="text-2xl md:text-3xl font-normal text-foreground mb-10">
						<Trans>The founders</Trans>
					</h2>
					{people.length === 0 ? (
						<p className="text-muted-foreground">
							<Trans>No team members yet.</Trans>
						</p>
					) : (
						<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-12 md:gap-10">
							{people.map((person) => {
								const initials = person.name
									.split(" ")
									.map((n) => n[0])
									.join("")
									.toUpperCase()
									.slice(0, 2);

								return (
									<article
										key={person.id}
										className="flex flex-col items-center text-center"
									>
										<Link href={`/team/${person.id}`} className="mb-5">
											<div className="relative size-32 md:size-36 rounded-full overflow-hidden bg-muted grayscale hover:grayscale-0 transition-all duration-300">
												{person.avatar ? (
													<Image
														src={person.avatar}
														alt={person.name}
														fill
														className="object-cover"
														sizes="144px"
													/>
												) : (
													<div className="absolute inset-0 flex items-center justify-center text-2xl font-medium text-foreground/30">
														{initials}
													</div>
												)}
											</div>
										</Link>

										<Link href={`/team/${person.id}`}>
											<h3 className="text-xl font-medium text-foreground hover:text-foreground/80 transition-colors">
												{person.name}
											</h3>
										</Link>
										<p className="text-sm text-muted-foreground mt-1">
											{person.role}
										</p>
										{person.bio && (
											<TeamBio
												bio={person.bio}
												className="text-sm text-muted-foreground leading-relaxed mt-3 [&_a]:text-muted-foreground [&_a]:underline [&_a]:underline-offset-2 [&_a]:hover:text-foreground"
											/>
										)}

										<div className="flex items-center gap-4 mt-4">
											{person.github && (
												<a
													href={`https://github.com/${person.github}`}
													target="_blank"
													rel="noopener noreferrer"
													className="text-muted-foreground hover:text-foreground transition-colors"
												>
													<RiGithubFill className="size-5" />
												</a>
											)}
											{person.linkedin && (
												<a
													href={`https://linkedin.com/in/${person.linkedin}`}
													target="_blank"
													rel="noopener noreferrer"
													className="text-muted-foreground hover:text-foreground transition-colors"
												>
													<RiLinkedinBoxFill className="size-5" />
												</a>
											)}
											{person.twitter && (
												<a
													href={`https://twitter.com/${person.twitter}`}
													target="_blank"
													rel="noopener noreferrer"
													className="text-muted-foreground hover:text-foreground transition-colors"
												>
													<RiTwitterXFill className="size-5" />
												</a>
											)}
										</div>
									</article>
								);
							})}
						</div>
					)}
					<div className="mt-14 text-center">
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
