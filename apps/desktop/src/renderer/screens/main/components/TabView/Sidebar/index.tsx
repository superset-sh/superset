import { motion } from "framer-motion";
import { useSidebarStore } from "renderer/stores";

export function Sidebar() {
	const { isSidebarOpen } = useSidebarStore();

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
				className="p-4 flex-1 overflow-y-auto"
			>
				<nav className="space-y-2">
					{/* Add navigation items here */}
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
			</motion.div>

			<motion.div
				initial={false}
				animate={{
					opacity: isSidebarOpen ? 1 : 0,
				}}
				transition={{
					duration: 0.15,
					ease: "easeInOut",
				}}
				className="p-4 border-t border-sidebar-border"
			></motion.div>
		</motion.aside>
	);
}
