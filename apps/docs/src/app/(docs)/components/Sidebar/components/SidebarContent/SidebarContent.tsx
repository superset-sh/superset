import type { LucideIcon } from "lucide-react";
import type { ReactNode, SVGProps } from "react";

interface Content {
	title: string;
	href?: string;
	Icon: ((props?: SVGProps<SVGSVGElement>) => ReactNode) | LucideIcon;
	isNew?: boolean;
	list: {
		title: string;
		href: string;
		icon: ((props?: SVGProps<SVGSVGElement>) => ReactNode) | LucideIcon;
		group?: boolean;
		separator?: boolean;
		isNew?: boolean;
	}[];
}

const PlayIcon = () => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="1.2em"
		height="1.2em"
		viewBox="0 0 24 24"
		role="img"
		aria-label="Play"
	>
		<path
			fill="currentColor"
			d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2m-1 14H9V8h2zm1 0V8l5 4z"
		/>
	</svg>
);

const BookIcon = () => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="1.2em"
		height="1.2em"
		viewBox="0 0 256 256"
		role="img"
		aria-label="Book"
	>
		<path
			fill="currentColor"
			d="M232 48h-64a32 32 0 0 0-32 32v87.73a8.17 8.17 0 0 1-7.47 8.25a8 8 0 0 1-8.53-8V80a32 32 0 0 0-32-32H24a8 8 0 0 0-8 8v144a8 8 0 0 0 8 8h72a24 24 0 0 1 24 23.94a7.9 7.9 0 0 0 5.12 7.55A8 8 0 0 0 136 232a24 24 0 0 1 24-24h72a8 8 0 0 0 8-8V56a8 8 0 0 0-8-8m-24 120h-39.73a8.17 8.17 0 0 1-8.25-7.47a8 8 0 0 1 8-8.53h39.73a8.17 8.17 0 0 1 8.25 7.47a8 8 0 0 1-8 8.53m0-32h-39.73a8.17 8.17 0 0 1-8.25-7.47a8 8 0 0 1 8-8.53h39.73a8.17 8.17 0 0 1 8.25 7.47a8 8 0 0 1-8 8.53m0-32h-39.73a8.17 8.17 0 0 1-8.27-7.47a8 8 0 0 1 8-8.53h39.73a8.17 8.17 0 0 1 8.27 7.47a8 8 0 0 1-8 8.53"
		/>
	</svg>
);

const DownloadIcon = () => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="1.2em"
		height="1.2em"
		viewBox="0 0 24 24"
		role="img"
		aria-label="Download"
	>
		<path
			fill="currentColor"
			fillRule="evenodd"
			d="M2 12c0-4.714 0-7.071 1.464-8.536C4.93 2 7.286 2 12 2c4.714 0 7.071 0 8.535 1.464C22 4.93 22 7.286 22 12c0 4.714 0 7.071-1.465 8.535C19.072 22 16.714 22 12 22s-7.071 0-8.536-1.465C2 19.072 2 16.714 2 12m10-5.75a.75.75 0 0 1 .75.75v5.19l1.72-1.72a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06l1.72 1.72V7a.75.75 0 0 1 .75-.75m-4 10a.75.75 0 0 0 0 1.5h8a.75.75 0 0 0 0-1.5z"
			clipRule="evenodd"
		/>
	</svg>
);

const ChartIcon = () => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="1.2em"
		height="1.2em"
		viewBox="0 0 16 16"
		role="img"
		aria-label="Chart"
	>
		<path
			fill="currentColor"
			d="M2 3.75C2 2.784 2.784 2 3.75 2h8.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25zM6 6.5a.5.5 0 0 0-1 0v4a.5.5 0 0 0 1 0zM8 8a.5.5 0 0 0-.5.5v2a.5.5 0 0 0 1 0v-2A.5.5 0 0 0 8 8m3-2.5a.5.5 0 0 0-1 0v5a.5.5 0 0 0 1 0z"
		></path>
	</svg>
);

const CodeIcon = () => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="1.2em"
		height="1.2em"
		viewBox="0 0 24 24"
		role="img"
		aria-label="Code"
	>
		<path
			fill="currentColor"
			d="m8 18l-6-6l6-6l1.425 1.425l-4.6 4.6L9.4 16.6zm8 0l-1.425-1.425l4.6-4.6L14.6 7.4L16 6l6 6z"
		/>
	</svg>
);

// Section header icons
const GetStartedIcon = () => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="1.4em"
		height="1.4em"
		viewBox="0 0 24 24"
		role="img"
		aria-label="Get Started"
	>
		<path
			fill="currentColor"
			d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2m-1 14H9V8h2zm1 0V8l5 4z"
		/>
	</svg>
);

const CoreFeaturesIcon = () => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="1.4em"
		height="1.4em"
		viewBox="0 0 24 24"
		role="img"
		aria-label="Core Features"
	>
		<path
			fill="currentColor"
			fillRule="evenodd"
			d="M14.25 4.48v3.057c0 .111 0 .27.021.406a.94.94 0 0 0 .444.683a.96.96 0 0 0 .783.072c.13-.04.272-.108.378-.159L17 8.005l1.124.534c.106.05.248.119.378.16a.96.96 0 0 0 .783-.073a.94.94 0 0 0 .444-.683c.022-.136.021-.295.021-.406V3.031q.17-.008.332-.013C21.154 2.98 22 3.86 22 4.933v11.21c0 1.112-.906 2.01-2.015 2.08c-.97.06-2.108.179-2.985.41c-1.082.286-2.373.904-3.372 1.436q-.422.224-.878.323V5.174a3.6 3.6 0 0 0 .924-.371q.277-.162.576-.323m5.478 8.338a.75.75 0 0 1-.546.91l-4 1a.75.75 0 1 1-.364-1.456l4-1a.75.75 0 0 1 .91.546M11.25 5.214a3.4 3.4 0 0 1-.968-.339C9.296 4.354 8.05 3.765 7 3.487c-.887-.233-2.041-.352-3.018-.412C2.886 3.008 2 3.9 2 4.998v11.146c0 1.11.906 2.01 2.015 2.079c.97.06 2.108.179 2.985.41c1.081.286 2.373.904 3.372 1.436q.422.224.878.324zM4.273 8.818a.75.75 0 0 1 .91-.546l4 1a.75.75 0 1 1-.365 1.456l-4-1a.75.75 0 0 1-.545-.91m.91 3.454a.75.75 0 1 0-.365 1.456l4 1a.75.75 0 0 0 .364-1.456z"
			clipRule="evenodd"
		/>
		<path
			fill="currentColor"
			d="M18.25 3.151c-.62.073-1.23.18-1.75.336a8 8 0 0 0-.75.27v3.182l.75-.356l.008-.005a1.1 1.1 0 0 1 .492-.13q.072 0 .138.01c.175.029.315.1.354.12l.009.005l.75.356V3.15"
		/>
	</svg>
);

const GuidesIcon = () => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="1.4em"
		height="1.4em"
		viewBox="0 0 24 24"
		role="img"
		aria-label="Guides"
	>
		<path
			fill="currentColor"
			d="M6.5 2h11A2.5 2.5 0 0 1 20 4.5v15a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2m0 1.5a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-15a1 1 0 0 0-1-1zM8 18a.75.75 0 0 1 0-1.5h8a.75.75 0 0 1 0 1.5zm0-3a.75.75 0 0 1 0-1.5h8a.75.75 0 0 1 0 1.5zm0-3a.75.75 0 0 1 0-1.5h8a.75.75 0 0 1 0 1.5zm0-3a.75.75 0 0 1 0-1.5h8a.75.75 0 0 1 0 1.5zm0-3a.75.75 0 0 1 0-1.5h8a.75.75 0 0 1 0 1.5z"
		/>
	</svg>
);

export const contents: Content[] = [
	{
		title: "Get Started",
		Icon: GetStartedIcon,
		list: [
			{
				title: "Quick Start",
				href: "/quick-start",
				icon: PlayIcon,
			},
			{
				title: "Overview",
				href: "/overview",
				icon: BookIcon,
			},
			{
				title: "Installation",
				href: "/installation",
				icon: DownloadIcon,
			},
		],
	},
	{
		title: "Core Features",
		Icon: CoreFeaturesIcon,
		list: [
			{
				title: "Core Features",
				href: "/core-features",
				icon: ChartIcon,
			},
		],
	},
	{
		title: "How to Guides",
		Icon: GuidesIcon,
		list: [
			{
				title: "Setup & Teardown Scripts",
				href: "/setup-teardown-scripts",
				icon: CodeIcon,
			},
		],
	},
];
