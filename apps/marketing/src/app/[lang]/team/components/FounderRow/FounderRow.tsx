import Image from "next/image";
import Link from "next/link";
import {
	RiGithubFill,
	RiLinkedinBoxFill,
	RiTwitterXFill,
} from "react-icons/ri";
import type { Person } from "@/lib/people";
import { TeamBio } from "../TeamBio";

interface FounderRowProps {
	person: Person;
}

export function FounderRow({ person }: FounderRowProps) {
	const initials = person.name
		.split(" ")
		.map((n) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);

	return (
		<article className="grid grid-cols-1 sm:grid-cols-[160px_1fr] md:grid-cols-[200px_1fr] gap-6 md:gap-10 py-10 border-t border-border">
			<Link href={`/team/${person.id}`} className="block w-40 sm:w-full">
				<div className="relative aspect-square rounded-lg overflow-hidden bg-muted grayscale hover:grayscale-0 transition-all duration-300">
					{person.avatar ? (
						<Image
							src={person.avatar}
							alt={person.name}
							fill
							className="object-cover"
							sizes="200px"
						/>
					) : (
						<div className="absolute inset-0 flex items-center justify-center text-3xl font-medium text-foreground/30">
							{initials}
						</div>
					)}
				</div>
			</Link>

			<div className="max-w-2xl">
				<Link href={`/team/${person.id}`}>
					<h3 className="text-2xl font-normal text-foreground hover:text-foreground/80 transition-colors">
						{person.name}
					</h3>
				</Link>
				<p className="font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground mt-2">
					{person.role}
				</p>
				{person.story && (
					<TeamBio
						bio={person.story}
						className="text-foreground/90 leading-relaxed mt-5 [&_a]:underline [&_a]:underline-offset-2 [&_a]:hover:text-foreground"
					/>
				)}
				{person.bio && (
					<TeamBio
						bio={person.bio}
						className="text-sm text-muted-foreground leading-relaxed mt-3 [&_a]:text-muted-foreground [&_a]:underline [&_a]:underline-offset-2 [&_a]:hover:text-foreground"
					/>
				)}

				<div className="flex items-center gap-4 mt-5">
					{person.github && (
						<a
							href={`https://github.com/${person.github}`}
							target="_blank"
							rel="noopener noreferrer"
							aria-label="GitHub"
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
							aria-label="LinkedIn"
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
							aria-label="X"
							className="text-muted-foreground hover:text-foreground transition-colors"
						>
							<RiTwitterXFill className="size-5" />
						</a>
					)}
				</div>
			</div>
		</article>
	);
}
