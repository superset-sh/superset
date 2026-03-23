import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Subprocessors - Superset",
	description:
		"List of third-party subprocessors that Superset engages to provide its services.",
};

const subprocessors = [
	{
		name: "Anthropic, PBC",
		location: "USA",
		purpose: "Artificial intelligence",
	},
	{
		name: "Cloudflare, Inc.",
		location: "USA",
		purpose: "Edge proxy and web application firewall",
	},
	{
		name: "ElectricSQL Ltd",
		location: "USA",
		purpose: "Real-time data sync and streaming",
	},
	{ name: "Neon Inc.", location: "USA", purpose: "Cloud database" },
	{ name: "PostHog, Inc.", location: "USA", purpose: "Product analytics" },
	{ name: "Resend, Inc.", location: "USA", purpose: "Email delivery" },
	{ name: "Sentry", location: "USA", purpose: "Error monitoring" },
	{ name: "Stripe, Inc.", location: "USA", purpose: "Payment processing" },
	{ name: "Tavily, Inc.", location: "USA", purpose: "Web search" },
	{
		name: "Upstash, Inc.",
		location: "USA",
		purpose: "Rate limiting, caching, and background jobs",
	},
	{
		name: "Vercel Inc.",
		location: "USA",
		purpose: "Server hosting and file storage",
	},
];

export default function SubprocessorsPage() {
	return (
		<main className="bg-background pt-24 pb-16 min-h-screen">
			<article className="max-w-3xl mx-auto px-6 sm:px-8">
				<header className="border-b border-border pb-8 mb-10">
					<h1 className="text-3xl sm:text-4xl font-medium text-foreground">
						Subprocessors
					</h1>
					<p className="mt-4 text-sm text-muted-foreground">
						Last updated: March 23, 2026
					</p>
				</header>

				<div className="space-y-10 text-muted-foreground leading-relaxed">
					<section className="space-y-4">
						<h2 className="text-xl font-medium text-foreground">
							List of Subprocessors
						</h2>
						<ul className="list-disc pl-6 space-y-3">
							{subprocessors.map((sp) => (
								<li key={sp.name}>
									<strong className="text-foreground">
										{sp.name} ({sp.location})
									</strong>
									: {sp.purpose}
								</li>
							))}
						</ul>
					</section>
				</div>
			</article>
		</main>
	);
}
