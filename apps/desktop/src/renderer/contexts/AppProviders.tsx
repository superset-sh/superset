import type React from "react";
import { useState } from "react";
import {
	SidebarProvider,
	TabProvider,
	TaskProvider,
	WorkspaceProvider,
	WorktreeOperationsProvider,
} from "./index";

interface AppProvidersProps {
	children: React.ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
	// Tab selection state needs to be lifted to AppProviders level
	// so WorkspaceProvider can use it
	const [selectedWorktreeId, setSelectedWorktreeId] = useState<string | null>(
		null,
	);
	const [selectedTabId, setSelectedTabId] = useState<string | null>(null);

	return (
		<WorkspaceProvider
			setSelectedWorktreeId={setSelectedWorktreeId}
			setSelectedTabId={setSelectedTabId}
		>
			<TabProvider
				selectedWorktreeId={selectedWorktreeId}
				setSelectedWorktreeId={setSelectedWorktreeId}
				selectedTabId={selectedTabId}
				setSelectedTabId={setSelectedTabId}
			>
				<SidebarProvider>
					<WorktreeOperationsProvider>
						<TaskProvider>{children}</TaskProvider>
					</WorktreeOperationsProvider>
				</SidebarProvider>
			</TabProvider>
		</WorkspaceProvider>
	);
}
