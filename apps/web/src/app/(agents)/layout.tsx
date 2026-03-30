import { api } from "@/trpc/server";
import { Footer } from "../(dashboard-legacy)/components/Footer";
import { Header } from "../(dashboard-legacy)/components/Header";
import { SidebarNav } from "../(dashboard-legacy)/components/SidebarNav";
import { getAgentsUiAccess } from "./utils/getAgentsUiAccess";

export default async function AgentsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const { hasAgentsUiAccess } = await getAgentsUiAccess();

	if (hasAgentsUiAccess) {
		return (
			<div className="flex min-h-[100dvh] flex-col bg-background">
				{children}
			</div>
		);
	}

	const trpc = await api();
	const organization = await trpc.user.myOrganization.query();
	const displayName = organization?.name ?? "Superset";

	return (
		<div className="flex min-h-screen flex-col">
			<Header />

			<div className="mx-auto min-h-[calc(100svh-13rem)] w-[95vw] max-w-screen-2xl pb-8 pt-16">
				<div className="flex flex-col gap-8 md:flex-row">
					<aside className="w-80 shrink-0">
						<div className="sticky top-24">
							<h1 className="text-2xl font-medium leading-none">
								{displayName}
							</h1>
							<SidebarNav />
						</div>
					</aside>

					<main className="flex-1">{children}</main>
				</div>
			</div>

			<Footer />
		</div>
	);
}
