import Image from "next/image";
import Link from "next/link";
import {
	RiGithubFill,
	RiLinkedinBoxFill,
	RiTwitterXFill,
} from "react-icons/ri";
import type { Person } from "@/lib/people";

interface TeamMemberCardProps {
	person: Person;
}

export function TeamMemberCard({ person }: TeamMemberCardProps) {
	const initials = person.name
		.split(" ")
		.map((n) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);

	return (
		<Link href={`/team/${person.id}`} className="block group">
			<article className="flex flex-col border border-border bg-background p-6 transition-all hover:bg-muted/50 hover:border-foreground/20">
				<div className="flex items-center gap-4 mb-4">
					{person.avatar ? (
						<div className="size-12 relative rounded-full overflow-hidden flex-shrink-0">
							<Image
								src={person.avatar}
								alt={person.name}
								fill
								className="object-cover"
								sizes="48px"
							/>
						</div>
					) : (
						<div className="size-12 rounded-full bg-muted flex items-center justify-center font-medium text-foreground/70 flex-shrink-0">
							{initials}
						</div>
					)}
					<div>
						<h2 className="text-base font-medium text-foreground group-hover:text-foreground/90">
							{person.name}
						</h2>
						<span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
							{person.role}
						</span>
					</div>
				</div>

				{person.bio && (
					<p className="text-sm text-muted-foreground leading-relaxed mb-4">
						{person.bio}
					</p>
				)}

				<div className="flex items-center gap-3 mt-auto">
					{person.twitter && (
						<RiTwitterXFill className="size-3.5 text-muted-foreground/60" />
					)}
					{person.github && (
						<RiGithubFill className="size-3.5 text-muted-foreground/60" />
					)}
					{person.linkedin && (
						<RiLinkedinBoxFill className="size-3.5 text-muted-foreground/60" />
					)}
				</div>
			</article>
		</Link>
	);
}
