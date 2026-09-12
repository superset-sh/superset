import { Trans } from "@lingui/react/macro";
import Image from "next/image";

const STRIP_LOGOS = [
	{
		name: "microsoft",
		label: "Microsoft",
		logo: "/logos/microsoft-wordmark.svg",
		height: 18,
	},
	{
		name: "openai",
		label: "OpenAI",
		logo: "/logos/openai-wordmark.svg",
		height: 18,
	},
	{ name: "google", label: "Google", logo: "/logos/google.svg", height: 22 },
	{
		name: "vercel",
		label: "Vercel",
		logo: "/logos/vercel-wordmark.svg",
		height: 34,
	},
	{
		name: "datadog",
		label: "Datadog",
		logo: "/logos/datadog-wordmark.svg",
		height: 38,
	},
	{ name: "amazon", label: "Amazon", logo: "/logos/amazon.png", height: 20 },
];

export function TrustStrip() {
	return (
		<div className="flex flex-col items-center gap-6">
			<p className="text-sm text-muted-foreground">
				<Trans>Trusted by builders from</Trans>
			</p>
			<div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-70">
				{STRIP_LOGOS.map((client) => (
					<Image
						key={client.name}
						src={client.logo}
						alt={client.label}
						width={160}
						height={client.height}
						className="object-contain grayscale brightness-0 invert"
						style={{ height: client.height, width: "auto" }}
						unoptimized
					/>
				))}
			</div>
		</div>
	);
}
