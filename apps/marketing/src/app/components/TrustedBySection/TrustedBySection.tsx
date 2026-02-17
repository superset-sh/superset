"use client";

import Image from "next/image";
import Marquee from "react-fast-marquee";

const CLIENT_LOGOS = [
	{ name: "ycombinator", logo: "/logos/yc.png", height: 40 },
	{ name: "amazon", logo: "/logos/amazon.png", height: 30, marginTop: 20 },
	{ name: "google", logo: "/logos/google.svg", height: 32, marginTop: 10 },
	{ name: "cloudflare", logo: "/logos/cloudflare.png", height: 36 },
	// { name: "a16z", logo: "/logos/a16z.svg", height: 32 }, // they use it but need to go through approvals
	{ name: "webflow", logo: "/logos/webflow.svg", height: 24 },
	{ name: "vercel", logo: "/logos/vercel.svg", height: 22 },
	{ name: "oracle", logo: "/logos/oracle.svg", height: 20 },
	{ name: "servicenow", logo: "/logos/servicenow.svg", height: 22 },
	{ name: "scribe", logo: "/logos/scribe.svg", height: 34 },
	{ name: "browseruse", logo: "/logos/browseruse.svg", height: 26 },
	{ name: "mastra", logo: "/logos/mastra.svg", height: 26, text: "Mastra" },
	{
		name: "courier",
		logo: "/logos/courier.png",
		height: 36,
		borderRadius: 8,
		text: "Courier",
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
	return (
		<section className="py-6 sm:py-12 md:py-18 bg-background overflow-hidden">
			<div className="max-w-7xl mx-auto">
				<div>
					<h2 className="hidden sm:block text-lg sm:text-xl font-mono font-normal text-center mb-4 sm:mb-8 text-foreground px-4">
						Trusted by builders from
					</h2>
				</div>
				<div className="relative">
					{/* Left fade overlay */}
					<div className="absolute left-0 top-0 bottom-0 w-24 sm:w-32 md:w-40 bg-linear-to-r from-background to-transparent z-10 pointer-events-none" />

					<Marquee speed={65} gradient={false} pauseOnHover={false} autoFill>
						{CLIENT_LOGOS.map((client) => (
							<div
								key={client.name}
								className="flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity cursor-pointer whitespace-nowrap h-10 sm:h-14 gap-1.5 sm:gap-2 mx-5 sm:mx-10"
								style={{ willChange: "transform" }}
							>
								<Image
									src={client.logo}
									alt={client.name}
									width={160}
									height={client.height}
									className="object-contain scale-75 sm:scale-100"
									style={{
										height: client.height,
										width: "auto",
										borderRadius: client?.borderRadius ?? 0,
										marginTop: client?.marginTop ?? 0,
									}}
									unoptimized
								/>
								{client.text && (
									<span className="ml-2 mt-1 font-medium text-foreground text-[1rem] sm:text-[1.3rem]">
										{client.text}
									</span>
								)}
							</div>
						))}
					</Marquee>

					{/* Right fade overlay */}
					<div className="absolute right-0 top-0 bottom-0 w-24 sm:w-32 md:w-40 bg-linear-to-l from-background to-transparent z-10 pointer-events-none" />
				</div>
			</div>
		</section>
	);
}
