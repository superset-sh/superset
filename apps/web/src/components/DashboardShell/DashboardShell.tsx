import { msg } from "@lingui/core/macro";

import { AppHeader, type AppHeaderNavItem } from "../AppHeader";
import { Footer } from "./components/Footer";

const NAV_ITEMS: AppHeaderNavItem[] = [
	{ href: "/agents", label: msg({ message: "Home" }) },
	{ href: "/integrations", label: msg({ message: "Integrations" }) },
	{ href: "/settings/account", label: msg({ message: "Account" }) },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex min-h-[100dvh] flex-col bg-background">
			<AppHeader navItems={NAV_ITEMS} />
			<main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
				{children}
			</main>
			<Footer />
		</div>
	);
}
