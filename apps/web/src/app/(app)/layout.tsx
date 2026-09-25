import { DashboardShell } from "./components/DashboardShell";
import { requireSession } from "./utils/requireSession";

export default async function AppLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	await requireSession();

	return <DashboardShell>{children}</DashboardShell>;
}
