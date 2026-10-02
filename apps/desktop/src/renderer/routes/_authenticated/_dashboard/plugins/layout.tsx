import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import { useScrollReset } from "renderer/routes/_authenticated/settings/hooks/useScrollReset";

export const Route = createFileRoute("/_authenticated/_dashboard/plugins")({
	component: PluginsLayout,
});

function PluginsLayout() {
	const { pathname } = useLocation();
	const contentRef = useScrollReset<HTMLDivElement>(pathname);

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<PageHeader />
			<div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto">
				<Outlet />
			</div>
		</div>
	);
}
