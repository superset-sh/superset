import type { LucideIcon } from "lucide-react";
import type { ReactNode, SVGProps } from "react";

type IconComponent =
	| ((props?: SVGProps<SVGSVGElement>) => ReactNode)
	| LucideIcon;

interface SidebarItem {
	title: string;
	href: string;
	isNew?: boolean;
}

interface SidebarSection {
	title: string;
	Icon: IconComponent;
	items: SidebarItem[];
}

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

const HelpIcon = () => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="1.4em"
		height="1.4em"
		viewBox="0 0 24 24"
		role="img"
		aria-label="Help"
	>
		<path
			fill="currentColor"
			d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2m1 17h-2v-2h2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41c0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25"
		/>
	</svg>
);

export const sections: SidebarSection[] = [
	{
		title: "Get Started",
		Icon: GetStartedIcon,
		items: [
			{ title: "Quick Start", href: "/quick-start" },
			{ title: "Overview", href: "/overview" },
			{ title: "Installation", href: "/installation" },
			{ title: "First Workspace", href: "/first-workspace" },
		],
	},
	{
		title: "Core Features",
		Icon: CoreFeaturesIcon,
		items: [
			{ title: "Workspaces", href: "/workspaces" },
			{ title: "Diff Viewer", href: "/diff-viewer" },
			{ title: "Terminal", href: "/terminal-integration" },
			{ title: "Port Management", href: "/ports" },
			{ title: "AI Agents", href: "/agent-integration" },
		],
	},
	{
		title: "Guides",
		Icon: GuidesIcon,
		items: [
			{ title: "Setup Scripts", href: "/setup-teardown-scripts" },
			{ title: "IDE Integration", href: "/use-with-ide" },
			{ title: "Monorepos", href: "/using-monorepos" },
			{ title: "Keyboard Shortcuts", href: "/keyboard-shortcuts" },
			{ title: "Customization", href: "/customization" },
		],
	},
	{
		title: "Help",
		Icon: HelpIcon,
		items: [{ title: "FAQ", href: "/faq" }],
	},
];
