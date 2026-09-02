import { type ReactNode, useEffect } from "react";
import { CommandContextProvider } from "./core/ContextProvider";
import { registerAllModules } from "./modules";
import { CommandPalette } from "./ui/CommandPalette/CommandPalette";
import { CommandPaletteTrigger } from "./ui/CommandPaletteTrigger/CommandPaletteTrigger";
import { DeleteWorkspaceMount } from "./ui/DeleteWorkspaceMount/DeleteWorkspaceMount";
import { FolderImportMount } from "./ui/FolderImportMount/FolderImportMount";
import { QuickCreateWorkspaceMount } from "./ui/QuickCreateWorkspaceMount/QuickCreateWorkspaceMount";
import { RemoveFromSidebarMount } from "./ui/RemoveFromSidebarMount/RemoveFromSidebarMount";
import { SetPreferredOpenInAppMount } from "./ui/SetPreferredOpenInAppMount/SetPreferredOpenInAppMount";

export function CommandPaletteHost({ children }: { children?: ReactNode }) {
	useEffect(() => {
		const unregister = registerAllModules();
		return unregister;
	}, []);

	return (
		<CommandContextProvider>
			<CommandPaletteTrigger />
			<CommandPalette />
			<DeleteWorkspaceMount />
			<RemoveFromSidebarMount />
			<SetPreferredOpenInAppMount />
			<FolderImportMount />
			<QuickCreateWorkspaceMount />
			{children}
		</CommandContextProvider>
	);
}
