import type { SetupTab } from "renderer/stores";
import { SetupTerminal } from "./SetupTerminal";

interface SetupTabViewProps {
	tab: SetupTab;
}

export function SetupTabView({ tab }: SetupTabViewProps) {
	return (
		<div className="w-full h-full overflow-hidden bg-background">
			<SetupTerminal
				tabId={tab.id}
				workspaceId={tab.workspaceId}
				setupCommands={tab.setupCommands}
				setupCwd={tab.setupCwd}
				setupCopyResults={tab.setupCopyResults}
			/>
		</div>
	);
}
