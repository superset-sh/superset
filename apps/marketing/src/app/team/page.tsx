import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
	RiGithubFill,
	RiLinkedinBoxFill,
	RiTwitterXFill,
} from "react-icons/ri";
import { getAllPeople } from "@/lib/people";

export const metadata: Metadata = {
	title: "About",
	description:
		"Meet the team behind Superset — building parallel coding agents for developers.",
	alternates: {
		canonical: "/team",
	},
	openGraph: {
		title: "About | Superset",
		description:
			"Meet the team behind Superset — building parallel coding agents for developers.",
		url: "/team",
		images: ["/opengraph-image"],
	},
	twitter: {
		card: "summary_large_image",
		title: "About | Superset",
		description:
			"Meet the team behind Superset — building parallel coding agents for developers.",
		images: ["/opengraph-image"],
	},
};

export default function TeamPage() {
	const people = getAllPeople();

	return (
		<main className="relative min-h-screen bg-background">
			<div className="max-w-5xl mx-auto px-6 py-24 md:py-32">
				{/* Header Section */}
				<section className="mb-20 md:mb-28">
					<h1 className="text-4xl sm:text-5xl md:text-6xl font-normal text-foreground mb-8">
						Meet the{" "}
						<span
							className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl ml-2 font-light tracking-wide"
							style={{ fontFamily: "var(--font-micro5)" }}
						>
							FOUNDERS
						</span>
					</h1>

					<p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-xl mb-8">
						Superset is built by a team of 3 ex YC CTOs. We want to create the
						best team that has fun working together.
						<br />
						Success will be a lagging indicator.
					</p>

					<Link
						href="/blog"
						className="inline-flex items-center gap-2 text-foreground hover:text-foreground/80 transition-colors group"
					>
						Read more on our blog
						<ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
					</Link>
				</section>

				{/* Founders Grid */}
				<section>
					{people.length === 0 ? (
						<p className="text-muted-foreground">No team members yet.</p>
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
											<h2 className="text-xl font-medium text-foreground hover:text-foreground/80 transition-colors">
												{person.name}
											</h2>
										</Link>
										<p className="text-sm text-muted-foreground mt-1">
											{person.role}
										</p>
										{person.bio && (
											<p
												className="text-sm text-muted-foreground leading-relaxed mt-3 [&_a]:text-muted-foreground [&_a]:underline [&_a]:underline-offset-2 [&_a]:hover:text-foreground"
												// biome-ignore lint/security/noDangerouslySetInnerHtml: controlled content from team data
												dangerouslySetInnerHTML={{ __html: person.bio }}
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
				</section>
			</div>
		</main>
	);
}
