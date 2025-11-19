import { DndProvider } from "react-dnd";
import { dragDropManager } from "../../lib/dnd";
import { AppFrame } from "./components/AppFrame";
import { Background } from "./components/Background";
import { TopBar } from "./components/TopBar";
import { WorkspaceView } from "./components/WorkspaceView";

export function MainScreen() {
	return (
		<DndProvider manager={dragDropManager}>
			<Background />
			<AppFrame>
				<div className="flex flex-col h-full w-full">
					<TopBar />
					<div className="flex flex-1 overflow-hidden">
						<WorkspaceView />
					</div>
				</div>
			</AppFrame>
		</DndProvider>
	);
}
