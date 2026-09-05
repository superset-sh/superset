import { AppSidebar, type AppSidebarVariant } from "../AppSidebar";

export function DashboardShell({
	variant,
	children,
}: {
	variant: AppSidebarVariant;
	children: React.ReactNode;
}) {
	return (
		<div className="flex h-dvh w-full flex-col overflow-hidden bg-background md:flex-row">
			<AppSidebar variant={variant} />
			<main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
				{children}
			</main>
		</div>
	);
}
