import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { HostsSettingsSidebar } from "./components/HostsSettingsSidebar";

export const Route = createFileRoute("/_authenticated/settings/hosts")({
	component: HostsSettingsLayout,
});

function HostsSettingsLayout() {
	const params = useParams({ strict: false }) as { hostId?: string };
	return (
		<div className="flex h-full w-full">
			<HostsSettingsSidebar selectedHostId={params.hostId ?? null} />
			<div className="flex-1 overflow-y-auto">
				<Outlet />
			</div>
		</div>
	);
}
