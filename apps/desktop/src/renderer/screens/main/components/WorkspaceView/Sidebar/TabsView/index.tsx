import { Button } from "@superset/ui/button";
import { LayoutGroup, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { HiMiniCloud, HiMiniPlus } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";
import { useAddTab, useTabs } from "renderer/stores";
import { TabItem } from "./TabItem";
import { UngroupDropZone } from "./UngroupDropZone";

export function TabsView() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const activeWorkspaceId = activeWorkspace?.id;
	const allTabs = useTabs();
	const addTab = useAddTab();
	const [isCreatingCloud, setIsCreatingCloud] = useState(false);

	const tabs = useMemo(
		() =>
			activeWorkspaceId
				? allTabs.filter(
						(tab) => tab.workspaceId === activeWorkspaceId && !tab.parentId,
					)
				: [],
		[activeWorkspaceId, allTabs],
	);

	const getChildTabs = (parentId: string) =>
		allTabs.filter((tab) => tab.parentId === parentId);

	const handleAddTab = () => {
		if (activeWorkspaceId) {
			addTab(activeWorkspaceId);
		}
	};

	const handleAddCloudTerminal = async () => {
		if (!activeWorkspace) return;

		setIsCreatingCloud(true);
		try {
			// Generate random two-word name for cloud sandbox
			const adjectives = [
				"happy",
				"sleepy",
				"brave",
				"clever",
				"gentle",
				"bright",
				"calm",
				"bold",
				"swift",
				"quiet",
			];
			const nouns = [
				"cat",
				"fox",
				"owl",
				"bear",
				"wolf",
				"deer",
				"hawk",
				"lynx",
				"seal",
				"dove",
			];
			const randomAdj =
				adjectives[Math.floor(Math.random() * adjectives.length)];
			const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
			const timestamp = Date.now().toString(36);
			const sandboxName = `${randomAdj}-${randomNoun}-${timestamp}`;

			// Create cloud sandbox
			const result = await window.ipcRenderer.invoke("cloud-sandbox-create", {
				name: sandboxName,
				projectId: activeWorkspace.projectId,
				taskDescription: `Cloud development for ${activeWorkspace.name}`,
			});

			if (result.success && result.sandbox?.claudeHost) {
				// Open the Claude host URL in the default browser
				const claudeUrl = result.sandbox.claudeHost.startsWith("http")
					? result.sandbox.claudeHost
					: `https://${result.sandbox.claudeHost}`;
				window.open(claudeUrl, "_blank");
			} else {
				console.error("Failed to create cloud sandbox:", result.error);
				alert(
					`Failed to create cloud terminal: ${result.error || "Unknown error"}`,
				);
			}
		} catch (error) {
			console.error("Error creating cloud terminal:", error);
			alert(
				`Error creating cloud terminal: ${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			setIsCreatingCloud(false);
		}
	};

	return (
		<nav className="space-y-2 flex flex-col h-full p-2">
			<UngroupDropZone>
				{(draggedTab, isDragOver, dropIndex) => (
					<LayoutGroup>
						{/* Local Terminals Section */}
						<Button
							variant="ghost"
							onClick={handleAddTab}
							className="w-full text-start group px-3 py-2 rounded-md cursor-pointer flex items-center gap-2"
							disabled={!activeWorkspaceId}
						>
							<HiMiniPlus className="size-4" />
							<span className="truncate flex-1">New Terminal</span>
						</Button>
						<div className="text-sm text-sidebar-foreground space-y-2 relative pt-2">
							{tabs.map((tab, index) => (
								<motion.div
									key={tab.id}
									layout
									initial={false}
									transition={{
										layout: { duration: 0.2, ease: "easeInOut" },
									}}
									className="relative"
								>
									{/* Drop line indicator before this tab */}
									{isDragOver && draggedTab && index === dropIndex && (
										<div className="absolute -top-px left-0 right-0 h-0.5 bg-primary rounded-full z-20 pointer-events-none" />
									)}
									<div data-tab-item>
										<TabItem tab={tab} childTabs={getChildTabs(tab.id)} />
									</div>
								</motion.div>
							))}
							{/* Drop line indicator at the end */}
							{isDragOver && draggedTab && dropIndex >= tabs.length && (
								<div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full z-20 pointer-events-none" />
							)}
						</div>

						{/* Cloud Terminals Section */}
						<div className="pt-4 border-t border-sidebar-border mt-4">
							<Button
								variant="ghost"
								onClick={handleAddCloudTerminal}
								className="w-full text-start group px-3 py-2 rounded-md cursor-pointer flex items-center gap-2 text-blue-400 hover:text-blue-300"
								disabled={!activeWorkspaceId || isCreatingCloud}
							>
								<HiMiniCloud className="size-4" />
								<span className="truncate flex-1">
									{isCreatingCloud ? "Creating..." : "New Cloud Terminal"}
								</span>
							</Button>
						</div>
					</LayoutGroup>
				)}
			</UngroupDropZone>
		</nav>
	);
}
