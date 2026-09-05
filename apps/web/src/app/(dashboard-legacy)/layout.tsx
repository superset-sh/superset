import { auth } from "@superset/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/DashboardShell";
import { PageContainer } from "@/components/PageContainer";
import { getAgentsUiAccess } from "../(agents)/utils/getAgentsUiAccess";

export default async function DashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session) {
		redirect("/sign-in");
	}

	const { hasAgentsUiAccess } = await getAgentsUiAccess();

	return (
		<DashboardShell variant={hasAgentsUiAccess ? "agents" : "dashboard"}>
			<PageContainer>{children}</PageContainer>
		</DashboardShell>
	);
}
