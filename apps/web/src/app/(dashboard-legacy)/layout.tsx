import { auth } from "@superset/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/DashboardShell";
import { PageContainer } from "@/components/PageContainer";

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

	return (
		<DashboardShell>
			<PageContainer>{children}</PageContainer>
		</DashboardShell>
	);
}
