import { motion } from "framer-motion";
import { useSidebarStore } from "renderer/stores";
import { SidebarMode } from "renderer/stores/sidebar-state";
import { ChangesView } from "./ChangesView";
import { ModeCarousel } from "./ModeCarousel";
import { TabsView } from "./TabsView";

export function Sidebar() {
	const { isSidebarOpen, currentMode, setMode } = useSidebarStore();

	const modes: SidebarMode[] = [SidebarMode.Tabs, SidebarMode.Changes];

	return (
		<motion.aside
			initial={false}
			animate={{
				width: isSidebarOpen ? 256 : 0,
			}}
			transition={{
				duration: 0.2,
				ease: "easeInOut",
			}}
			className="h-full flex flex-col overflow-hidden"
			style={{
				pointerEvents: isSidebarOpen ? "auto" : "none",
			}}
		>
			<motion.div
				initial={false}
				animate={{
					opacity: isSidebarOpen ? 1 : 0,
				}}
				transition={{
					duration: 0.15,
					ease: "easeInOut",
				}}
				className="flex-1 flex flex-col overflow-hidden"
			>
				<ModeCarousel
					modes={modes}
					currentMode={currentMode}
					onModeSelect={setMode}
				>
					{(mode) => {
						if (mode === SidebarMode.Changes) {
							return <ChangesView />;
						}

						return <TabsView />;
					}}
				</ModeCarousel>
			</motion.div>
		</motion.aside>
	);
}
