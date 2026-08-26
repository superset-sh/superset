import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { useScrollReset } from "renderer/routes/_authenticated/settings/hooks/useScrollReset";
import { UsageSectionToggle } from "./components/UsageSectionToggle";

export const Route = createFileRoute("/_authenticated/_dashboard/usage")({
	component: UsageLayout,
});

function UsageLayout() {
	const { pathname } = useLocation();
	const contentRef = useScrollReset<HTMLDivElement>(pathname);

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			{/* Window-drag leaf standing in for the hidden TopBar. */}
			<div className="drag h-10 shrink-0" />
			<div className="mx-auto w-full max-w-5xl shrink-0 px-6">
				<UsageSectionToggle />
			</div>
			<div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto">
				<Outlet />
			</div>
		</div>
	);
}
