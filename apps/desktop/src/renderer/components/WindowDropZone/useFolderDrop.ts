import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useOpenProject } from "renderer/react-query/projects";

/**
 * Shared drag-and-drop handling for opening a folder as a project/workspace.
 *
 * Handles OS-level file drops (folders dragged in from Finder/Explorer),
 * resolves the dropped item to an absolute path via `webUtils.getPathForFile`,
 * registers it as a project via `openFromPath` (with `createWorkspace: false`,
 * so no default workspace is auto-created; the git-init dialog still handles
 * non-git folders), then navigates to the project page.
 */
export function useFolderDrop() {
	const navigate = useNavigate();
	// Dropping a folder registers a new project (not a workspace); the user lands
	// on the project page to create a workspace explicitly.
	const { openFromPath, isPending } = useOpenProject({
		createWorkspace: false,
	});
	const setTrafficLights =
		electronTrpc.window.setTrafficLightsVisible.useMutation();
	const [isDragOver, setIsDragOver] = useState(false);
	// dragenter/dragleave fire for every nested element, so we track depth to
	// avoid flicker and only clear the overlay when the pointer truly leaves.
	const dragDepth = useRef(0);
	// Track whether we've hidden the macOS traffic lights so we only toggle on
	// the leading/trailing edge of a drag instead of on every dragover event.
	const trafficLightsHidden = useRef(false);

	const hideTrafficLights = useCallback(() => {
		if (trafficLightsHidden.current) return;
		trafficLightsHidden.current = true;
		setTrafficLights.mutate({ visible: false });
	}, [setTrafficLights]);

	const showTrafficLights = useCallback(() => {
		if (!trafficLightsHidden.current) return;
		trafficLightsHidden.current = false;
		setTrafficLights.mutate({ visible: true });
	}, [setTrafficLights]);

	// Latest `showTrafficLights` for the window-level reset below, whose effect
	// intentionally has no deps so it isn't torn down on every render.
	const showTrafficLightsRef = useRef(showTrafficLights);
	showTrafficLightsRef.current = showTrafficLights;

	// Open a single folder path and navigate to it. Shared by the in-window drop
	// handler and the Dock/"Open With" listener so both behave identically.
	// `openFromPath` registers the project (no default workspace) and shows the
	// git-init dialog for non-git folders.
	const openPath = useCallback(
		async (filePath: string) => {
			try {
				const project = await openFromPath(filePath);
				if (project) {
					navigate({
						to: "/project/$projectId",
						params: { projectId: project.id },
					});
				}
			} catch (err) {
				toast.error(
					err instanceof Error ? err.message : "Failed to open the folder",
				);
			}
		},
		[openFromPath, navigate],
	);

	// Folders dropped on the Dock/app icon (or opened via "Open With") are
	// delivered by the main process as an `open-folder-path` IPC message with one
	// or more absolute paths. Open them through the same flow as an in-window drop.
	useEffect(() => {
		const ipc = window.ipcRenderer;
		if (!ipc) return;
		const handler = async (paths: string[]) => {
			for (const path of paths) {
				await openPath(path);
			}
		};
		ipc.on("open-folder-path", handler);
		return () => ipc.off("open-folder-path", handler);
	}, [openPath]);

	// Guard the whole window: by default Electron navigates the page to a
	// dropped file's file:// URL (the `will-navigate` guard only blocks
	// http(s)), which would blow away the app. Prevent that for any file drag,
	// and reset the overlay if a drag ends anywhere so it never sticks open.
	useEffect(() => {
		const preventFileNavigation = (e: DragEvent) => {
			if (e.dataTransfer?.types.includes("Files")) {
				e.preventDefault();
			}
		};
		const reset = () => {
			dragDepth.current = 0;
			setIsDragOver(false);
			showTrafficLightsRef.current();
		};
		window.addEventListener("dragover", preventFileNavigation);
		window.addEventListener("drop", preventFileNavigation);
		window.addEventListener("dragend", reset);
		window.addEventListener("drop", reset);
		return () => {
			window.removeEventListener("dragover", preventFileNavigation);
			window.removeEventListener("drop", preventFileNavigation);
			window.removeEventListener("dragend", reset);
			window.removeEventListener("drop", reset);
			// Never leave the traffic lights hidden if we unmount mid-drag.
			showTrafficLightsRef.current();
		};
	}, []);

	const onDragEnter = useCallback(
		(e: React.DragEvent) => {
			if (!e.dataTransfer.types.includes("Files")) return;
			e.preventDefault();
			dragDepth.current += 1;
			setIsDragOver(true);
			hideTrafficLights();
		},
		[hideTrafficLights],
	);

	const onDragOver = useCallback((e: React.DragEvent) => {
		if (!e.dataTransfer.types.includes("Files")) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = "copy";
	}, []);

	const onDragLeave = useCallback(
		(e: React.DragEvent) => {
			if (!e.dataTransfer.types.includes("Files")) return;
			e.preventDefault();
			dragDepth.current = Math.max(0, dragDepth.current - 1);
			if (dragDepth.current === 0) {
				setIsDragOver(false);
				showTrafficLights();
			}
		},
		[showTrafficLights],
	);

	const onDrop = useCallback(
		async (e: React.DragEvent) => {
			if (!e.dataTransfer.types.includes("Files")) return;
			e.preventDefault();
			e.stopPropagation();
			dragDepth.current = 0;
			setIsDragOver(false);
			showTrafficLights();

			if (isPending) return;

			const firstFile = Array.from(e.dataTransfer.files)[0];
			if (!firstFile) return;

			let filePath: string;
			try {
				filePath = window.webUtils.getPathForFile(firstFile);
			} catch {
				filePath = "";
			}

			if (!filePath) {
				toast.error("Could not get the path from the dropped item");
				return;
			}

			await openPath(filePath);
		},
		[openPath, isPending, showTrafficLights],
	);

	return {
		isDragOver,
		isPending,
		dropHandlers: { onDragEnter, onDragOver, onDragLeave, onDrop },
	};
}
