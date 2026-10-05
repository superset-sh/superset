import {
	createFileRoute,
	Outlet,
	retainSearchParams,
	useLocation,
	useMatchRoute,
	useSearch,
} from "@tanstack/react-router";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { SettingsHostSelect } from "renderer/routes/_authenticated/settings/components/SettingsHostSelect";
import { useScrollReset } from "renderer/routes/_authenticated/settings/hooks/useScrollReset";
import { validateSettingsHostSearch } from "renderer/routes/_authenticated/settings/hooks/useSettingsHost";
import { UsageSectionToggle } from "./components/UsageSectionToggle";

export const Route = createFileRoute("/_authenticated/settings/usage")({
	component: UsageLayout,
	validateSearch: validateSettingsHostSearch,
	search: { middlewares: [retainSearchParams(["hostId"])] },
});

function UsageLayout() {
	const { pathname } = useLocation();
	const isV2 = useIsV2CloudEnabled();
	const contentRef = useScrollReset<HTMLDivElement>(pathname);
	const matchRoute = useMatchRoute();
	const isResources = !!matchRoute({ to: "/settings/usage/resources" });
	const { workspaceId } = useSearch({ strict: false });

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			{/* Aligned to the same content column the usage pages center themselves on. */}
			<div className="mx-auto flex w-full max-w-5xl shrink-0 flex-wrap items-center justify-between gap-4 px-6 pt-4">
				<UsageSectionToggle />
				{isV2 && !isResources && !workspaceId && <SettingsHostSelect />}
			</div>
			<div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto">
				<Outlet />
			</div>
		</div>
	);
}
