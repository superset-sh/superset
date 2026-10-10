import { Trans } from "@lingui/react/macro";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { getAbout } from "@/lib/about";
import { getAllPeople } from "@/lib/people";
import { getTeamBioText } from "../../../utils/teamBio";

export function TeamStrip({ className = "" }: { className?: string }) {
	const people = getAllPeople();
	const { belief } = getAbout();

	return (
		<section className={className}>
			<blockquote className="m-0 mb-12 max-w-[54rem] text-2xl leading-[1.35] tracking-[-0.02em] text-foreground sm:text-[28px]">
				“{belief}”
				<cite className="mt-4 block font-mono text-[11px] leading-4 tracking-[0.07em] text-muted-foreground uppercase not-italic">
					<Trans>The founders</Trans>
				</cite>
			</blockquote>
			<ul className="m-0 grid list-none grid-cols-2 gap-6 p-0 lg:grid-cols-4">
				{people.map((person) => {
					const bio = person.longBio ?? person.bio;
					return (
						<li key={person.id}>
							<Link href={`/team/${person.id}`} className="group block">
								<div className="relative aspect-square overflow-hidden rounded-lg bg-muted grayscale transition-all duration-300 group-hover:grayscale-0">
									{person.avatar && (
										<Image
											src={person.avatar}
											alt={person.name}
											fill
											className="object-cover"
											sizes="(max-width: 1024px) 50vw, 300px"
										/>
									)}
								</div>
								<h3 className="mt-4 mb-1 text-[17px] font-[450] tracking-[-0.01em] text-foreground">
									{person.name}
								</h3>
								<p className="m-0 font-mono text-[11px] leading-4 tracking-[0.07em] text-muted-foreground uppercase">
									{person.role}
								</p>
								{bio && (
									<p className="mt-2 mb-0 text-sm leading-normal text-muted-foreground">
										{getTeamBioText(bio)}
									</p>
								)}
							</Link>
						</li>
					);
				})}
			</ul>
			<Link
				href="/team"
				className="group mt-8 inline-flex items-center gap-2 text-foreground transition-colors hover:text-foreground/80"
			>
				<Trans>Meet the team</Trans>
				<ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
			</Link>
		</section>
	);
}
