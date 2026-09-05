import { auth } from "@superset/auth/server";
import { COMPANY } from "@superset/shared/constants";
import { Separator } from "@superset/ui/separator";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@superset/ui/sidebar";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/env";
import { AppSidebar } from "./components/AppSidebar";
import { PageBreadcrumb } from "./components/PageBreadcrumb";

export default async function DashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session?.user) {
		redirect(env.NEXT_PUBLIC_WEB_URL);
	}

	if (!session.user.email?.endsWith(COMPANY.EMAIL_DOMAIN)) {
		redirect(env.NEXT_PUBLIC_WEB_URL);
	}

	return (
		<SidebarProvider>
			<AppSidebar
				user={{
					name: session.user.name,
					email: session.user.email,
					image: session.user.image,
				}}
			/>
			<SidebarInset>
				<header className="bg-background sticky top-0 flex h-16 shrink-0 items-center gap-2 border-b px-4">
					<SidebarTrigger className="-ml-1" />
					<Separator orientation="vertical" className="mr-2 h-4" />
					<PageBreadcrumb />
				</header>
				<div className="flex flex-1 flex-col gap-4 p-4">{children}</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
