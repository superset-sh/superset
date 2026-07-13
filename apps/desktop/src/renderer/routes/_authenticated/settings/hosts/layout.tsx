import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { useScrollReset } from "../hooks/useScrollReset";
import { HostsSettingsSidebar } from "./components/HostsSettingsSidebar";

export const Route = createFileRoute("/_authenticated/settings/hosts")({
	component: HostsSettingsLayout,
});

function HostsSettingsLayout() {
	const params = useParams({ strict: false }) as { hostId?: string };
	const contentRef = useScrollReset<HTMLDivElement>(params.hostId);
	return (
		<div className="flex h-full w-full">
			<HostsSettingsSidebar selectedHostId={params.hostId ?? null} />
			<div ref={contentRef} className="flex-1 overflow-y-auto">
				<Outlet />
			</div>
		</div>
	);
}
