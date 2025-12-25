import { api } from "@/trpc/server";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { SidebarNav } from "./components/SidebarNav";

export default async function DashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
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
