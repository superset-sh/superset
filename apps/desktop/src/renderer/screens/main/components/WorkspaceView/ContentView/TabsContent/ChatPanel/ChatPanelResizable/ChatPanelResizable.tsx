import { ResizableHandle, ResizablePanel } from "@superset/ui/resizable";
import { useChatPanelStore } from "renderer/stores/chat-panel-state";
import { ChatPanel } from "../ChatPanel";

export function ChatPanelResizable() {
	const { isOpen, size, setOpen, setSize } = useChatPanelStore();

	if (!isOpen) {
		return null;
	}

	return (
		<>
			<ResizableHandle className="w-1 bg-border/50 hover:bg-border transition-colors" />
			<ResizablePanel
				defaultSize={size}
				minSize={20}
				maxSize={50}
				onResize={setSize}
				id="chat-panel"
			>
				<ChatPanel onClose={() => setOpen(false)} />
			</ResizablePanel>
		</>
	);
}
