import { DndProvider } from "react-dnd";
import { dragDropManager } from "../../lib/dnd";
import { AppFrame } from "./components/AppFrame";
import { Background } from "./components/Background";
import { CenterView } from "./components/CenterView";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";

export function MainScreen() {
	return (
		<DndProvider manager={dragDropManager}>
			<Background />
			<AppFrame>
				<div className="flex flex-col h-full w-full">
					<TopBar />
					<div className="flex flex-1 overflow-hidden">
						<Sidebar />
						<CenterView />
					</div>
				</div>
			</AppFrame>
		</DndProvider>
	);
}
