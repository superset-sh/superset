import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_dashboard/memory")({
	component: MemoryLayout,
});

function MemoryLayout() {
	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			{/* Window-drag leaf standing in for the hidden TopBar. */}
			<div className="drag h-10 shrink-0" />
			<div className="min-h-0 flex-1 overflow-hidden">
				<Outlet />
			</div>
		</div>
	);
}
