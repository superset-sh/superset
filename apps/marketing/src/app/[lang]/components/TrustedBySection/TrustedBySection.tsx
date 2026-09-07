"use client";

import { Trans } from "@lingui/react/macro";
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
		name: "runway",
		label: "Runway",
		logo: "/logos/runway-wordmark.svg",
		height: 18,
	},
	{
		name: "wordware",
		label: "Wordware",
		logo: "/logos/wordware-wordmark.svg",
		height: 16,
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
		name: "toss",
		label: "Toss",
		logo: "/logos/toss-wordmark.svg",
		height: 18,
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
	return (
		<section className="bg-background px-6 sm:px-8">
			<div className="max-w-7xl mx-auto border-y border-border/60 py-10 sm:py-12">
				<h2 className="text-sm font-medium text-center mb-8 sm:mb-10 text-muted-foreground">
					<Trans>Trusted by builders from</Trans>
				</h2>
				<div className="grid grid-cols-2 min-[400px]:grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-x-6 gap-y-6 sm:gap-y-8">
					{CLIENT_LOGOS.map((client) => (
						<div
							key={client.name}
							className="flex items-center justify-center min-w-0 h-12 opacity-65"
						>
							<Image
								src={client.logo}
								alt={client.label}
								width={200}
								height={client.height}
								className={`object-contain max-w-full scale-90 ${client.invert === false ? "" : "grayscale brightness-0 invert"}`}
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
			</div>
		</section>
	);
}
