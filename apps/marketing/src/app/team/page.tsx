import type { Metadata } from "next";
import { GridCross } from "@/app/blog/components/GridCross";
import { getAllPeople } from "@/lib/people";
import { TeamMemberCard } from "./components/TeamMemberCard";

export const metadata: Metadata = {
	title: "Team",
	description:
		"Meet the team behind Superset — building parallel coding agents for developers.",
	alternates: {
		canonical: "/team",
	},
	openGraph: {
		title: "Team | Superset",
		description:
			"Meet the team behind Superset — building parallel coding agents for developers.",
		url: "/team",
		images: ["/opengraph-image"],
	},
	twitter: {
		card: "summary_large_image",
		title: "Team | Superset",
		description:
			"Meet the team behind Superset — building parallel coding agents for developers.",
		images: ["/opengraph-image"],
	},
};

export default function TeamPage() {
	const people = getAllPeople();

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
						Team
					</span>
					<h1 className="text-3xl md:text-4xl font-medium tracking-tight text-foreground mt-4">
						The People Behind Superset
					</h1>
					<p className="text-muted-foreground mt-3 max-w-lg">
						We're building the future of parallel coding agents for developers.
					</p>

					<GridCross className="bottom-0 left-0" />
					<GridCross className="bottom-0 right-0" />
				</div>
			</header>

			{/* Team grid */}
			<div className="relative max-w-3xl mx-auto px-6 py-12">
				{people.length === 0 ? (
					<p className="text-muted-foreground">No team members yet.</p>
				) : (
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
						{people.map((person) => (
							<TeamMemberCard key={person.id} person={person} />
						))}
					</div>
				)}
			</div>
		</main>
	);
}
