"use client";

import Image from "next/image";

const CLIENT_LOGOS = [
	{
		name: "microsoft",
		label: "Microsoft",
		logo: "/logos/microsoft-wordmark.svg",
		height: 20,
	},
	{
		name: "openai",
		label: "OpenAI",
		logo: "/logos/openai-wordmark.svg",
		height: 20,
	},
	{
		name: "netflix",
		label: "Netflix",
		logo: "/logos/netflix-wordmark.svg",
		height: 20,
	},
	{
		name: "perplexity",
		label: "Perplexity",
		logo: "/logos/perplexity-wordmark.svg",
		height: 28,
	},
	{
		name: "salesforce",
		label: "Salesforce",
		logo: "/logos/salesforce-wordmark-dark.svg",
		height: 50,
		invert: false,
	},
	{
		name: "wix",
		label: "Wix",
		logo: "/logos/wix-wordmark.svg",
		height: 16,
	},
	{
		name: "datadog",
		label: "Datadog",
		logo: "/logos/datadog-wordmark.svg",
		height: 42,
	},
	{
		name: "intercom",
		label: "Intercom",
		logo: "/logos/intercom-white.png",
		height: 26,
	},
	{
		name: "bytedance",
		label: "ByteDance",
		logo: "/logos/bytedance-wordmark.svg",
		height: 18,
	},
	{
		name: "ramp",
		label: "Ramp",
		logo: "/logos/ramp-wordmark.svg",
		height: 22,
	},
	{
		name: "google",
		label: "Google",
		logo: "/logos/google.svg",
		height: 24,
	},
	{
		name: "vercel",
		label: "Vercel",
		logo: "/logos/vercel-wordmark.svg",
		height: 38,
	},
	{
		name: "cloudflare",
		label: "Cloudflare",
		logo: "/logos/cloudflare-wordmark.svg",
		height: 48,
		marginTop: -16,
	},
	{
		name: "amazon",
		label: "Amazon",
		logo: "/logos/amazon.png",
		height: 22,
	},
] as {
	name: string;
	label: string;
	logo: string;
	height: number;
	marginTop?: number;
	borderRadius?: number;
	invert?: boolean;
}[];

export function TrustedBySection() {
	const midpoint = Math.ceil(CLIENT_LOGOS.length / 2);
	const logoRows = [
		CLIENT_LOGOS.slice(0, midpoint),
		CLIENT_LOGOS.slice(midpoint),
	];

	return (
		<section className="py-6 sm:py-12 md:py-18 overflow-hidden mc-stone-bg">
			<div className="max-w-7xl mx-auto">
				<div>
					<h2
						className="text-base sm:text-xl font-normal text-center mb-4 sm:mb-8 text-foreground px-4"
						style={{
							fontFamily: "var(--font-geist-pixel-square)",
							textShadow: "1px 1px 0 rgba(0,0,0,0.3)",
						}}
					>
						Trusted by builders from
					</h2>
				</div>

				{/* Mobile/tablet: responsive grid */}
				<div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3.5 px-4 md:hidden">
					{CLIENT_LOGOS.map((client) => (
						<div
							key={client.name}
							className="mc-slot flex items-center justify-center min-w-0 whitespace-nowrap h-16 sm:h-18"
						>
							<Image
								src={client.logo}
								alt={client.label}
								width={200}
								height={client.height}
								className={`object-contain scale-75 sm:scale-90 ${client.invert === false ? "" : "grayscale brightness-0 invert"}`}
								style={{
									height: client.height,
									width: "auto",
									borderRadius: client.borderRadius ?? 0,
									marginTop: client.marginTop ?? 0,
								}}
								unoptimized
							/>
						</div>
					))}
				</div>

				{/* Desktop: two explicit rows */}
				<div className="hidden md:block space-y-3 sm:space-y-4 px-4">
					{logoRows.map((row) => (
						<div
							key={row.map((client) => client.name).join("-")}
							className="flex items-center justify-center gap-3.5"
						>
							{row.map((client) => (
								<div
									key={client.name}
									className="mc-slot flex items-center justify-center whitespace-nowrap h-24 w-[168px]"
								>
									<Image
										src={client.logo}
										alt={client.label}
										width={200}
										height={client.height}
										className={`object-contain scale-100 ${client.invert === false ? "" : "grayscale brightness-0 invert"}`}
										style={{
											height: client.height,
											width: "auto",
											borderRadius: client.borderRadius ?? 0,
											marginTop: client.marginTop ?? 0,
										}}
										unoptimized
									/>
								</div>
							))}
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
