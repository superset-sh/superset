import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useHostService } from "renderer/routes/_authenticated/providers/HostServiceProvider";
import { WorkspaceTrpcProvider } from "./providers/WorkspaceTrpcProvider";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/v2-workspace",
)({
	component: V2WorkspaceLayout,
});

function V2WorkspaceLayout() {
	const { services } = useHostService();
	const orgService = services.values().next().value ?? null;

	if (!orgService) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground">
				Host service not available
			</div>
		);
	}

	return (
		<WorkspaceTrpcProvider hostUrl={orgService.url}>
			<Outlet />
		</WorkspaceTrpcProvider>
	);
}
