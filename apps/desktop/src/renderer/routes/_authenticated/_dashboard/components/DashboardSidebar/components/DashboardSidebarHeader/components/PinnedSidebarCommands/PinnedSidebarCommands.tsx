import {
	type Command,
	executeCommand,
	useCommandContext,
	useFrameStackStore,
} from "renderer/commandPalette";
import { PinnedSidebarCommandButton } from "./components/PinnedSidebarCommandButton";
import { usePinnedSidebarCommands } from "./hooks/usePinnedSidebarCommands";

interface PinnedSidebarCommandsProps {
	isCollapsed: boolean;
}

export function PinnedSidebarCommands({
	isCollapsed,
}: PinnedSidebarCommandsProps) {
	const context = useCommandContext();
	const commands = usePinnedSidebarCommands();
	const openCommandPalette = useFrameStackStore((state) => state.setOpen);
	const pushFrame = useFrameStackStore((state) => state.pushFrame);

	const handleRun = (command: Command) => {
		if (command.children || command.renderFrame) {
			openCommandPalette(true);
			pushFrame(command);
			return;
		}
		void executeCommand(command, context);
	};

	return commands.map((command) => (
		<PinnedSidebarCommandButton
			key={command.id}
			command={command}
			isCollapsed={isCollapsed}
			onRun={handleRun}
		/>
	));
}
