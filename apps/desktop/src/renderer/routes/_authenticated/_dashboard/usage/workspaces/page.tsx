import { createFileRoute } from "@tanstack/react-router";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider";
import { UsageWorkspacesPage } from "../components/UsageWorkspacesPage";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/usage/workspaces/",
)({
	component: WorkspacesUsagePage,
});

function WorkspacesUsagePage() {
	const { activeHostUrl } = useLocalHostService();

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			{/* Window-drag leaf standing in for the hidden TopBar. */}
			<div className="drag h-10 shrink-0" />
			<div className="min-h-0 flex-1 overflow-y-auto">
				<UsageWorkspacesPage hostUrl={activeHostUrl} />
			</div>
		</div>
	);
}
