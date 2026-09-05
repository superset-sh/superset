import { DashboardShell } from "@/components/DashboardShell";
import { getAgentsUiAccess } from "./utils/getAgentsUiAccess";

export default async function AgentsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	await getAgentsUiAccess();

	return <DashboardShell>{children}</DashboardShell>;
}
