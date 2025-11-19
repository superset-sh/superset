import { DndProvider } from "react-dnd";
import { dragDropManager } from "../../lib/dnd";
import { AppFrame } from "./components/AppFrame";
import { Background } from "./components/Background";

export function MainScreen() {
	return (
		<DndProvider manager={dragDropManager}>
			<Background />
			<AppFrame>
				<div className="flex flex-col h-full w-full">Hi</div>
			</AppFrame>
		</DndProvider>
	);
}
