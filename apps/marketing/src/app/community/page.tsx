import { COMPANY } from "@superset/shared/constants";
import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Community",
	description:
		"Join the Superset community to get help, share ideas, and stay up to date with the latest news and updates.",
	alternates: {
		canonical: `${COMPANY.MARKETING_URL}/community`,
	},
};

interface GitHubRepoResponse {
	stargazers_count: number;
}

async function getGitHubStars(): Promise<number | null> {
	try {
		const match = COMPANY.GITHUB_URL.match(/github\.com\/([^/]+\/[^/]+)/);
		if (!match) return null;

		const response = await fetch(`https://api.github.com/repos/${match[1]}`, {
			headers: { Accept: "application/vnd.github.v3+json" },
			next: { revalidate: 3600 },
		});

		if (!response.ok) return null;

		const data: GitHubRepoResponse = await response.json();
		return data.stargazers_count;
	} catch {
		return null;
	}
}

const COMMUNITY_LINKS = [
	{
		name: "DISCORD",
		href: COMPANY.DISCORD_URL,
		cta: "JOIN OUR DISCORD",
		icon: (
			<svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
				<title>Discord</title>
				<path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
			</svg>
		),
	},
	{
		name: "YOUTUBE",
		href: "https://www.youtube.com/@superset-sh",
		cta: "SUBSCRIBE",
		icon: (
			<svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
				<title>YouTube</title>
				<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
			</svg>
		),
	},
	{
		name: "LINKEDIN",
		href: "https://www.linkedin.com/company/superset-sh",
		cta: "FOLLOW US",
		icon: (
			<svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
				<title>LinkedIn</title>
				<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
			</svg>
		),
	},
	{
		name: "TWITTER",
		href: COMPANY.X_URL,
		cta: "FOLLOW ON X",
		icon: (
			<svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
				<title>X / Twitter</title>
				<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
			</svg>
		),
	},
	{
		name: "GITHUB",
		href: COMPANY.GITHUB_URL,
		cta: "VIEW ON GITHUB",
		icon: (
			<svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
				<title>GitHub</title>
				<path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
			</svg>
		),
	},
];

export default async function CommunityPage() {
	const stars = await getGitHubStars();

	return (
		<main className="bg-background pt-24 pb-16 min-h-screen">
			<div className="max-w-4xl mx-auto px-6 sm:px-8">
				{/* Hero */}
				<header className="text-center mb-16">
					<h1 className="text-4xl sm:text-5xl font-medium tracking-tight text-foreground">
						Community
					</h1>
					<p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
						Join the <span className="font-semibold italic">Superset</span>{" "}
						community to get help, share ideas, and stay up to date with the
						latest news and updates.
					</p>
				</header>

				{/* Community Links - Boxy Grid */}
				<div className="border border-border">
					{/* First Row - Icons */}
					<div className="grid grid-cols-3 divide-x divide-border">
						{COMMUNITY_LINKS.slice(0, 3).map((link) => (
							<div
								key={link.name}
								className="flex flex-col items-center justify-center py-12 sm:py-16"
							>
								<div className="mb-4 text-foreground">{link.icon}</div>
								<span className="text-sm font-medium tracking-wider text-muted-foreground">
									{link.name}
								</span>
							</div>
						))}
					</div>

					{/* First Row - CTAs */}
					<div className="grid grid-cols-3 divide-x divide-border border-t border-border">
						{COMMUNITY_LINKS.slice(0, 3).map((link) => (
							<a
								key={link.cta}
								href={link.href}
								target="_blank"
								rel="noopener noreferrer"
								className="flex items-center justify-center gap-2 py-4 text-xs sm:text-sm font-medium tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
							>
								{link.cta}
								<ArrowUpRight className="size-3 sm:size-4" />
							</a>
						))}
					</div>

					{/* Second Row - Icons */}
					<div className="grid grid-cols-2 divide-x divide-border border-t border-border">
						{COMMUNITY_LINKS.slice(3).map((link) => (
							<div
								key={link.name}
								className="flex flex-col items-center justify-center py-12 sm:py-16"
							>
								<div className="mb-4 text-foreground">{link.icon}</div>
								<span className="text-sm font-medium tracking-wider text-muted-foreground">
									{link.name}
								</span>
							</div>
						))}
					</div>

					{/* Second Row - CTAs */}
					<div className="grid grid-cols-2 divide-x divide-border border-t border-border">
						{COMMUNITY_LINKS.slice(3).map((link) => (
							<a
								key={link.cta}
								href={link.href}
								target="_blank"
								rel="noopener noreferrer"
								className="flex items-center justify-center gap-2 py-4 text-xs sm:text-sm font-medium tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
							>
								{link.cta}
								<ArrowUpRight className="size-3 sm:size-4" />
							</a>
						))}
					</div>
				</div>

				{/* Stats Section */}
				{stars && (
					<div className="border border-border border-t-0">
						{/* Stats Numbers Row */}
						<div className="flex items-center justify-center py-12 sm:py-16">
							<span className="text-4xl sm:text-6xl font-semibold tracking-tight text-muted-foreground">
								{stars}
							</span>
						</div>

						{/* Stats Labels Row */}
						<a
							href={COMPANY.GITHUB_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center justify-center gap-2 py-4 border-t border-border text-xs sm:text-sm font-medium tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
						>
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="currentColor"
							>
								<title>GitHub</title>
								<path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
							</svg>
							STARS
							<ArrowUpRight className="size-3 sm:size-4" />
						</a>
					</div>
				)}
			</div>
		</main>
	);
}
