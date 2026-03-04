"use client";

import Image from "next/image";

const CLIENT_LOGOS = [
	{
		name: "amazon",
		logo: "/logos/amazon.png",
		height: 24,
		marginTop: 10,
	},
	{
		name: "google",
		logo: "/logos/google.svg",
		height: 24,
		marginTop: 4,
	},
	{
		name: "doordash",
		logo: "/logos/doordash.svg",
		height: 22,
		text: "DoorDash",
	},
	{
		name: "intercom",
		logo: "/logos/intercom-white.png",
		height: 24,
	},
	{ name: "vercel", logo: "/logos/vercel.svg", height: 15 },
	{
		name: "cloudflare",
		logo: "/logos/cloudflare-white.png",
		height: 38,
		marginTop: -20,
	},
	{ name: "webflow", logo: "/logos/webflow.svg", height: 17 },
	{ name: "oracle", logo: "/logos/oracle.svg", height: 14 },
	{
		name: "atlassian",
		logo: "/logos/atlassian-white.png",
		height: 28,
		marginTop: 4,
	},
	{
		name: "servicenow",
		logo: "/logos/servicenow.svg",
		height: 15,
	},
	{ name: "wix", logo: "/logos/wix.svg", height: 34 },
	{ name: "ycombinator", logo: "/logos/yc.png", height: 28 },
	{
		name: "browseruse",
		logo: "/logos/browseruse.svg",
		height: 20,
	},
	{
		name: "mastra",
		logo: "/logos/mastra.svg",
		height: 18,
		text: "Mastra",
	},
] as {
	name: string;
	logo: string;
	height: number;
	marginTop?: number;
	borderRadius?: number;
	text?: string;
}[];

export function TrustedBySection() {
	const midpoint = Math.ceil(CLIENT_LOGOS.length / 2);
	const logoRows = [
		CLIENT_LOGOS.slice(0, midpoint),
		CLIENT_LOGOS.slice(midpoint),
	];

	return (
		<section className="py-6 sm:py-12 md:py-18 bg-background overflow-hidden">
			<div className="max-w-7xl mx-auto">
				<div>
					<h2 className="text-base sm:text-xl font-mono font-normal text-center mb-4 sm:mb-8 text-foreground px-4">
						Trusted by builders from
					</h2>
				</div>

				{/* Mobile/tablet: responsive grid to avoid horizontal overflow */}
				<div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3.5 px-4 md:hidden">
					{CLIENT_LOGOS.map((client) => (
						<div
							key={client.name}
							className="flex items-center justify-center min-w-0 whitespace-nowrap h-16 sm:h-18 rounded-[2px] border border-foreground/[0.1] bg-foreground/[0.03] opacity-90 hover:opacity-100 transition-opacity"
						>
							<Image
								src={client.logo}
								alt={client.name}
								width={160}
								height={client.height}
								className="object-contain scale-75 sm:scale-90 grayscale brightness-0 invert"
								style={{
									height: client.height,
									width: "auto",
									borderRadius: client?.borderRadius ?? 0,
									marginTop: client?.marginTop ?? 0,
								}}
								unoptimized
							/>
							{client.text && (
								<span className="ml-2 mt-0.5 font-medium text-foreground text-[0.9rem]">
									{client.text}
								</span>
							)}
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
									className="flex items-center justify-center whitespace-nowrap h-24 w-[168px] rounded-[2px] border border-foreground/[0.1] bg-foreground/[0.03] opacity-90 hover:opacity-100 transition-opacity"
								>
									<Image
										src={client.logo}
										alt={client.name}
										width={160}
										height={client.height}
										className="object-contain scale-100 grayscale brightness-0 invert"
										style={{
											height: client.height,
											width: "auto",
											borderRadius: client?.borderRadius ?? 0,
											marginTop: client?.marginTop ?? 0,
										}}
										unoptimized
									/>
									{client.text && (
										<span className="ml-2 mt-0.5 font-medium text-foreground text-[1.1rem]">
											{client.text}
										</span>
									)}
								</div>
							))}
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
