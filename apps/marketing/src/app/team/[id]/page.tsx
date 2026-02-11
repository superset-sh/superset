import { COMPANY } from "@superset/shared/constants";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import {
	RiGithubFill,
	RiLinkedinBoxFill,
	RiTwitterXFill,
} from "react-icons/ri";
import { GridCross } from "@/app/blog/components/GridCross";
import { mdxComponents } from "@/app/blog/components/mdx-components";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { getAllPeople, getPersonById } from "@/lib/people";

interface PageProps {
	params: Promise<{ id: string }>;
}

function PersonJsonLd({
	person,
	url,
}: {
	person: {
		name: string;
		role: string;
		avatar?: string;
		twitter?: string;
		github?: string;
		linkedin?: string;
	};
	url: string;
}) {
	const sameAs: string[] = [];
	if (person.twitter) sameAs.push(`https://x.com/${person.twitter}`);
	if (person.github) sameAs.push(`https://github.com/${person.github}`);
	if (person.linkedin)
		sameAs.push(`https://linkedin.com/in/${person.linkedin}`);

	const schema = {
		"@context": "https://schema.org",
		"@type": "Person",
		name: person.name,
		jobTitle: person.role,
		url,
		worksFor: {
			"@type": "Organization",
			name: COMPANY.NAME,
			url: COMPANY.MARKETING_URL,
		},
		...(person.avatar && {
			image: `${COMPANY.MARKETING_URL}${person.avatar}`,
		}),
		...(sameAs.length > 0 && { sameAs }),
	};

	return (
		<script
			type="application/ld+json"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: Safe for JSON-LD structured data
			dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
		/>
	);
}

export default async function TeamMemberPage({ params }: PageProps) {
	const { id } = await params;
	const person = getPersonById(id);

	if (!person) {
		notFound();
	}

	const allPeople = getAllPeople();
	const otherMembers = allPeople.filter((p) => p.id !== id);
	const url = `${COMPANY.MARKETING_URL}/team/${id}`;
	const hasContent = person.content.trim().length > 0;

	const initials = person.name
		.split(" ")
		.map((n) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);

	return (
		<main>
			<PersonJsonLd person={person} url={url} />
			<BreadcrumbJsonLd
				items={[
					{ name: "Home", url: COMPANY.MARKETING_URL },
					{ name: "About", url: `${COMPANY.MARKETING_URL}/team` },
					{ name: person.name, url },
				]}
			/>

			<article className="relative min-h-screen">
				{/* Vertical guide lines */}
				<div
					className="absolute inset-0 pointer-events-none"
					style={{
						backgroundImage: `
							linear-gradient(to right, transparent 0%, transparent calc(50% - 384px), rgba(255,255,255,0.06) calc(50% - 384px), rgba(255,255,255,0.06) calc(50% - 383px), transparent calc(50% - 383px), transparent calc(50% + 383px), rgba(255,255,255,0.06) calc(50% + 383px), rgba(255,255,255,0.06) calc(50% + 384px), transparent calc(50% + 384px))
						`,
					}}
				/>

				{/* Hero header */}
				<header className="relative border-b border-border">
					<div className="max-w-3xl mx-auto px-6 pt-16 pb-10 md:pt-20 md:pb-12">
						<GridCross className="top-0 left-0" />
						<GridCross className="top-0 right-0" />

						<div className="text-center">
							<span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
								{person.role}
							</span>

							{/* Avatar */}
							<div className="flex justify-center mt-6 mb-4">
								{person.avatar ? (
									<div className="size-24 md:size-28 relative rounded-full overflow-hidden">
										<Image
											src={person.avatar}
											alt={person.name}
											fill
											className="object-cover"
											sizes="112px"
											priority
										/>
									</div>
								) : (
									<div className="size-24 md:size-28 rounded-full bg-muted flex items-center justify-center text-xl font-medium text-foreground/70">
										{initials}
									</div>
								)}
							</div>

							<h1 className="text-3xl md:text-4xl lg:text-5xl font-medium tracking-tight text-foreground mb-4">
								{person.name}
							</h1>

							{person.bio && (
								<p
									className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto mb-6 [&_a]:text-muted-foreground [&_a]:underline [&_a]:underline-offset-2 [&_a]:hover:text-foreground"
									// biome-ignore lint/security/noDangerouslySetInnerHtml: controlled content from team data
									dangerouslySetInnerHTML={{ __html: person.bio }}
								/>
							)}

							{/* Social links */}
							<div className="flex items-center justify-center gap-3">
								{person.twitter && (
									<a
										href={`https://x.com/${person.twitter}`}
										target="_blank"
										rel="noopener noreferrer"
										className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors border border-border px-3 py-1.5"
									>
										<RiTwitterXFill className="size-3.5" />
										<span>@{person.twitter}</span>
									</a>
								)}
								{person.github && (
									<a
										href={`https://github.com/${person.github}`}
										target="_blank"
										rel="noopener noreferrer"
										className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors border border-border px-3 py-1.5"
									>
										<RiGithubFill className="size-3.5" />
										<span>{person.github}</span>
									</a>
								)}
								{person.linkedin && (
									<a
										href={`https://linkedin.com/in/${person.linkedin}`}
										target="_blank"
										rel="noopener noreferrer"
										className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors border border-border px-3 py-1.5"
									>
										<RiLinkedinBoxFill className="size-3.5" />
										<span>LinkedIn</span>
									</a>
								)}
							</div>
						</div>
					</div>

					{/* Bottom crosses */}
					<div className="max-w-3xl mx-auto px-6 relative">
						<GridCross className="bottom-0 left-0" />
						<GridCross className="bottom-0 right-0" />
					</div>
				</header>

				{/* Back link section */}
				<div className="relative border-b border-border">
					<div className="max-w-3xl mx-auto px-6 py-4">
						<Link
							href="/team"
							className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
						>
							<ArrowLeft className="h-4 w-4" />
							Back to About
						</Link>
					</div>
				</div>

				{/* MDX Content */}
				{hasContent && (
					<div className="relative max-w-3xl mx-auto px-6 py-12">
						<div className="prose max-w-none">
							<MDXRemote source={person.content} components={mdxComponents} />
						</div>
					</div>
				)}

				{/* Other team members */}
				{otherMembers.length > 0 && (
					<section className="relative border-t border-border">
						<div className="max-w-3xl mx-auto px-6 py-12">
							<h2 className="text-xl font-medium text-foreground mb-6">
								Other Team Members
							</h2>
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
								{otherMembers.map((member) => (
									<Link
										key={member.id}
										href={`/team/${member.id}`}
										className="flex items-center gap-3 border border-border p-4 transition-all hover:bg-muted/50 hover:border-foreground/20"
									>
										{member.avatar ? (
											<div className="size-10 relative rounded-full overflow-hidden flex-shrink-0">
												<Image
													src={member.avatar}
													alt={member.name}
													fill
													className="object-cover"
													sizes="40px"
												/>
											</div>
										) : (
											<div className="size-10 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-foreground/70 flex-shrink-0">
												{member.name
													.split(" ")
													.map((n) => n[0])
													.join("")
													.toUpperCase()
													.slice(0, 2)}
											</div>
										)}
										<div>
											<span className="text-sm font-medium text-foreground">
												{member.name}
											</span>
											<span className="block text-xs font-mono text-muted-foreground uppercase tracking-wider">
												{member.role}
											</span>
										</div>
									</Link>
								))}
							</div>
						</div>
					</section>
				)}

				{/* Footer */}
				<footer className="relative border-t border-border">
					<div className="max-w-3xl mx-auto px-6 relative">
						<GridCross className="top-0 left-0" />
						<GridCross className="top-0 right-0" />
					</div>
					<div className="max-w-3xl mx-auto px-6 py-10">
						<Link
							href="/team"
							className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
						>
							<ArrowLeft className="h-4 w-4" />
							All team members
						</Link>
					</div>
				</footer>
			</article>
		</main>
	);
}

export function generateStaticParams() {
	return getAllPeople().map((person) => ({ id: person.id }));
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { id } = await params;
	const person = getPersonById(id);

	if (!person) {
		return {};
	}

	const url = `${COMPANY.MARKETING_URL}/team/${id}`;

	return {
		title: `${person.name} — ${person.role}`,
		description: person.bio ?? `${person.name}, ${person.role} at Superset`,
		alternates: {
			canonical: url,
		},
		openGraph: {
			title: `${person.name} — ${person.role} at Superset`,
			description: person.bio ?? `${person.name}, ${person.role} at Superset`,
			type: "profile",
			url,
			siteName: COMPANY.NAME,
			...(person.avatar && {
				images: [`${COMPANY.MARKETING_URL}${person.avatar}`],
			}),
		},
		twitter: {
			card: "summary",
			title: `${person.name} — ${person.role} at Superset`,
			description: person.bio ?? `${person.name}, ${person.role} at Superset`,
			...(person.avatar && {
				images: [`${COMPANY.MARKETING_URL}${person.avatar}`],
			}),
		},
	};
}
