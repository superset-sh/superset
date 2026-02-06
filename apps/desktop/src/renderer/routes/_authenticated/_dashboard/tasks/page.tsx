import { createFileRoute } from "@tanstack/react-router";
import { StartWorkingDialog } from "./components/StartWorkingDialog";
import { TasksView } from "./components/TasksView";

export const Route = createFileRoute("/_authenticated/_dashboard/tasks/")({
	component: TasksPage,
});

function TasksPage() {
	return (
		<>
			<TasksView />
			<StartWorkingDialog />
		</>
	);
}
