import { DashboardShell } from "@/components/DashboardShell";
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

	return <DashboardShell>{children}</DashboardShell>;
}
