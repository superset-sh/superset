import { useRef, useState } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";

export function useSidebar() {
	const sidebarPanelRef = useRef<ImperativePanelHandle>(null);
	const [isSidebarOpen, setIsSidebarOpen] = useState(true);
	const [showSidebarOverlay, setShowSidebarOverlay] = useState(false);

	const handleCollapseSidebar = () => {
		const panel = sidebarPanelRef.current;
		if (panel && !panel.isCollapsed()) {
			panel.collapse();
			setIsSidebarOpen(false);
		}
	};

	const handleExpandSidebar = () => {
		const panel = sidebarPanelRef.current;
		if (panel?.isCollapsed()) {
			panel.expand();
			setIsSidebarOpen(true);
		}
	};

	const handleSidebarCollapse = () => {
		setShowSidebarOverlay(false);
	};

	return {
		sidebarPanelRef,
		isSidebarOpen,
		setIsSidebarOpen,
		showSidebarOverlay,
		setShowSidebarOverlay,
		handleCollapseSidebar,
		handleExpandSidebar,
		handleSidebarCollapse,
	};
}

