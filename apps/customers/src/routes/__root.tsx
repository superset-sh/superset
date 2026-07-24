import { authClient } from "@superset/auth/client";
import { COMPANY } from "@superset/shared/constants";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@superset/ui/breadcrumb";
import { Separator } from "@superset/ui/separator";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@superset/ui/sidebar";
import { Spinner } from "@superset/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { env } from "@/env";
import { useTRPC } from "@/trpc/react";

export const Route = createRootRoute({
	component: RootComponent,
});

function FullPageSpinner() {
	return (
		<div className="flex min-h-screen items-center justify-center">
			<Spinner className="size-6" />
		</div>
	);
}

/**
 * Client-side gate: teammates only. This is UX, not security — every
 * procedure the app calls is behind adminProcedure's @superset.sh check.
 */
function RootComponent() {
	const { data: session, isPending } = authClient.useSession();

	const allowed =
		!isPending &&
		session?.user != null &&
		(session.user.email?.endsWith(COMPANY.EMAIL_DOMAIN) ?? false);
	const denied = !isPending && !allowed;

	const trpc = useTRPC();
	const me = useQuery({
		...trpc.user.me.queryOptions(),
		enabled: allowed,
	});

	useEffect(() => {
		if (denied) {
			window.location.replace(env.NEXT_PUBLIC_WEB_URL);
		}
	}, [denied]);

	if (isPending || denied || me.isLoading) {
		return <FullPageSpinner />;
	}

	if (!me.data) {
		return <FullPageSpinner />;
	}

	return (
		<SidebarProvider>
			<AppSidebar user={me.data} />
			<SidebarInset>
				<header className="bg-background sticky top-0 flex h-16 shrink-0 items-center gap-2 border-b px-4">
					<SidebarTrigger className="-ml-1" />
					<Separator orientation="vertical" className="mr-2 h-4" />
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem className="hidden md:block">
								<BreadcrumbLink href="/">Superset</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator className="hidden md:block" />
							<BreadcrumbItem>
								<BreadcrumbPage>Customers</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>
				</header>
				<div className="flex flex-1 flex-col gap-4 p-4">
					<Outlet />
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
