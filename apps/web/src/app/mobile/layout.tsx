import { auth } from "@superset/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { MobileHeader } from "./components/MobileHeader";
import { MobileNav } from "./components/MobileNav";

export const metadata = {
	title: "Superset Mobile",
	description: "Voice-controlled workspace companion",
};

export default async function MobileLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session) {
		redirect("/sign-in?redirect=/mobile");
	}

	return (
		<div className="flex min-h-[100dvh] flex-col bg-black">
			<MobileHeader />

			<main className="flex-1 overflow-y-auto px-4 pb-20 pt-4">
				{children}
			</main>

			<MobileNav />
		</div>
	);
}
