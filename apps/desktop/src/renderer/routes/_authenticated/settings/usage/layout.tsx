import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useScrollReset } from "renderer/routes/_authenticated/settings/hooks/useScrollReset";
import { UsageSectionToggle } from "./components/UsageSectionToggle";
import { UsageSidebarToggle } from "./components/UsageSidebarToggle";

export const Route = createFileRoute("/_authenticated/settings/usage")({
	component: UsageLayout,
});

function UsageLayout() {
	const { pathname } = useLocation();
	const isV2 = useIsV2CloudEnabled();
	const contentRef = useScrollReset<HTMLDivElement>(pathname);

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			{/* Aligned to the same content column the usage pages center themselves on. */}
			<div className="mx-auto flex w-full max-w-5xl shrink-0 flex-wrap items-center justify-between gap-4 px-6 pt-4">
				<UsageSectionToggle />
				{isV2 && <UsageSidebarToggle />}
			</div>
			<div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto">
				<Outlet />
			</div>
		</div>
	);
}
