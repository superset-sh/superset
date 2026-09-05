import { DashboardShell } from "@/components/DashboardShell";
import { PageContainer } from "@/components/PageContainer";
import { getAgentsUiAccess } from "./utils/getAgentsUiAccess";

export default async function AgentsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const { hasAgentsUiAccess } = await getAgentsUiAccess();

	if (hasAgentsUiAccess) {
		return <DashboardShell variant="agents">{children}</DashboardShell>;
	}

	return (
		<DashboardShell variant="dashboard">
			<PageContainer>{children}</PageContainer>
		</DashboardShell>
	);
}
