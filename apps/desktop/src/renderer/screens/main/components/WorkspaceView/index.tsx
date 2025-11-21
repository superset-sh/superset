import { ContentView } from "./ContentView";
import { Sidebar } from "./Sidebar";

export function WorkspaceView() {
	return (
		<div className="flex flex-1 bg-sidebar">
			<Sidebar />
			<div className="flex-1 m-3 bg-background rounded p-2">
				<ContentView />
			</div>
		</div>
	);
}
