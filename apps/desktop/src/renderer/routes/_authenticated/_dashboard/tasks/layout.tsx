import { createFileRoute, Outlet } from "@tanstack/react-router";
import { StartWorkingDialog } from "./components/StartWorkingDialog";

export const Route = createFileRoute("/_authenticated/_dashboard/tasks")({
	component: TasksLayout,
});

function TasksLayout() {
	return (
		<>
			<Outlet />
			<StartWorkingDialog />
		</>
	);
}
