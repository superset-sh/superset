import { motion } from "framer-motion";
import { useSidebarStore } from "renderer/stores";
import { SidebarMode } from "renderer/stores/sidebar-state";
import { ModeCarousel } from "./ModeCarousel";

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
			className="h-full border-r border-sidebar-border bg-sidebar flex flex-col overflow-hidden"
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
						if (mode === "changes") {
							return (
								<div className="flex-1 flex items-center justify-center text-sidebar-foreground/60 text-sm">
									Changes view coming soon...
								</div>
							);
						}

						// Tabs mode
						return (
							<nav className="space-y-2">
								<div className="text-sm text-sidebar-foreground">
									<p className="font-medium mb-2">Navigation</p>
									<ul className="space-y-1">
										<li className="px-3 py-2 rounded-md hover:bg-sidebar-accent cursor-pointer">
											Dashboard
										</li>
										<li className="px-3 py-2 rounded-md hover:bg-sidebar-accent cursor-pointer">
											Projects
										</li>
										<li className="px-3 py-2 rounded-md hover:bg-sidebar-accent cursor-pointer">
											Settings
										</li>
									</ul>
								</div>
							</nav>
						);
					}}
				</ModeCarousel>
			</motion.div>
		</motion.aside>
	);
}
