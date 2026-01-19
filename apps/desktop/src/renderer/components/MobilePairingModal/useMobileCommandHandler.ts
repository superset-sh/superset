import { toast } from "@superset/ui/sonner";
import { useCallback, useEffect, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";

interface MobileCommand {
	id: string;
	transcript: string;
	targetType: "terminal" | "claude" | "task";
	targetId: string | null;
	createdAt: string;
}

// How long to capture terminal output after executing a command
const OUTPUT_CAPTURE_TIMEOUT_MS = 3000;
// Max output size to send back (to avoid huge responses)
const MAX_OUTPUT_SIZE = 10000;

/**
 * Hook to handle incoming mobile commands and execute them in the terminal.
 *
 * This hook subscribes to the mobile command stream, writes commands
 * to the active terminal pane, captures output, and sends it back to mobile.
 */
export function useMobileCommandHandler(workspaceId: string | null) {
	const writeMutation = electronTrpc.terminal.write.useMutation();
	const sendResponseMutation = electronTrpc.mobile.sendCommandResponse.useMutation();

	// Get state selectors from the tabs store
	const activeTabIds = useTabsStore((s) => s.activeTabIds);
	const focusedPaneIds = useTabsStore((s) => s.focusedPaneIds);
	const panes = useTabsStore((s) => s.panes);

	// Use refs to access latest values in subscription callback
	const writeMutationRef = useRef(writeMutation);
	writeMutationRef.current = writeMutation;

	const sendResponseMutationRef = useRef(sendResponseMutation);
	sendResponseMutationRef.current = sendResponseMutation;

	const workspaceIdRef = useRef(workspaceId);
	workspaceIdRef.current = workspaceId;

	const activeTabIdsRef = useRef(activeTabIds);
	activeTabIdsRef.current = activeTabIds;

	const focusedPaneIdsRef = useRef(focusedPaneIds);
	focusedPaneIdsRef.current = focusedPaneIds;

	const panesRef = useRef(panes);
	panesRef.current = panes;

	// Track active output capture sessions
	const outputCaptureRef = useRef<Map<string, { output: string; paneId: string }>>(new Map());

	// Handler for mobile commands
	const handleCommand = useCallback((command: MobileCommand) => {
		console.log("[mobile-handler] Received command:", command);

		// Only handle claude commands - terminal commands are handled by main process
		if (command.targetType !== "claude") {
			console.log("[mobile-handler] Skipping non-claude command (handled by main process):", command.targetType);
			return;
		}

		const currentWorkspaceId = workspaceIdRef.current;
		if (!currentWorkspaceId) {
			console.warn("[mobile-handler] No active workspace");
			toast.error("No active workspace to send command to");
			return;
		}

		// Get the active tab for this workspace
		const activeTabId = activeTabIdsRef.current[currentWorkspaceId];
		if (!activeTabId) {
			console.warn("[mobile-handler] No active tab for workspace:", currentWorkspaceId);
			toast.error("No active tab to send command to");
			return;
		}

		// Get the focused pane for the active tab
		const focusedPaneId = focusedPaneIdsRef.current[activeTabId];
		if (!focusedPaneId) {
			console.warn("[mobile-handler] No focused pane for tab:", activeTabId);
			toast.error("No focused pane to send command to");
			return;
		}

		// Get the pane details
		const pane = panesRef.current[focusedPaneId];
		if (!pane) {
			console.warn("[mobile-handler] Pane not found:", focusedPaneId);
			toast.error("Focused pane not found");
			return;
		}

		// Check if the pane is a terminal
		if (pane.type !== "terminal") {
			console.warn("[mobile-handler] Focused pane is not a terminal:", pane.type);
			toast.error("Please focus a terminal pane to receive voice commands");
			return;
		}

		// For Claude commands, send the message directly to the existing Claude session
		// Just the transcript text + newline to submit
		const commandText = command.transcript;

		console.log("[mobile-handler] Sending to Claude session:", {
			paneId: focusedPaneId,
			message: commandText.substring(0, 50),
		});

		// Start capturing output for this command
		outputCaptureRef.current.set(command.id, { output: "", paneId: focusedPaneId });

		// Write the command to terminal followed by newline to execute
		writeMutationRef.current.mutate({
			paneId: focusedPaneId,
			data: commandText + "\n",
		});

		// Show toast notification
		toast.success("Message sent to Claude", {
			description: command.transcript.substring(0, 50) + (command.transcript.length > 50 ? "..." : ""),
		});

		// After timeout, send the captured output back
		setTimeout(() => {
			const capture = outputCaptureRef.current.get(command.id);
			if (capture) {
				outputCaptureRef.current.delete(command.id);

				// Clean up the output (remove ANSI codes, trim)
				let cleanOutput = capture.output
					// Remove ANSI escape codes
					.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "")
					// Remove carriage returns
					.replace(/\r/g, "")
					// Trim whitespace
					.trim();

				// Truncate if too long
				if (cleanOutput.length > MAX_OUTPUT_SIZE) {
					cleanOutput = cleanOutput.substring(0, MAX_OUTPUT_SIZE) + "\n... (output truncated)";
				}

				console.log("[mobile-handler] Sending response:", {
					commandId: command.id,
					outputLength: cleanOutput.length,
				});

				if (cleanOutput) {
					sendResponseMutationRef.current.mutate({
						commandId: command.id,
						response: cleanOutput,
					});
				}
			}
		}, OUTPUT_CAPTURE_TIMEOUT_MS);
	}, []);

	// Subscribe to mobile commands
	electronTrpc.mobile.onMobileCommand.useSubscription(undefined, {
		onData: handleCommand,
		onError: (error) => {
			console.error("[mobile-handler] Subscription error:", error);
		},
	});

	// Subscribe to terminal output to capture responses
	// We use the terminal stream subscription to capture output
	electronTrpc.terminal.stream.useSubscription("__mobile_capture__", {
		onData: () => {
			// This subscription is a placeholder - we can't easily subscribe to specific panes
			// The actual output capture happens through a different mechanism
		},
		enabled: false, // Disabled - see note below
	});

	// Note: Capturing terminal output requires listening to the terminal stream for specific panes.
	// Since we can't dynamically subscribe to different panes, we'll use window event listeners
	// that the Terminal component can emit to.
	useEffect(() => {
		const handleTerminalOutput = (event: CustomEvent<{ paneId: string; data: string }>) => {
			const { paneId, data } = event.detail;

			// Check if any active capture session matches this pane
			for (const [commandId, capture] of outputCaptureRef.current.entries()) {
				if (capture.paneId === paneId) {
					capture.output += data;
				}
			}
		};

		window.addEventListener("terminal-output" as any, handleTerminalOutput as EventListener);
		console.log("[mobile-handler] Listening for terminal output events");

		return () => {
			window.removeEventListener("terminal-output" as any, handleTerminalOutput as EventListener);
		};
	}, []);

	// Log when the hook is mounted
	useEffect(() => {
		console.log("[mobile-handler] Hook mounted, workspaceId:", workspaceId);
		return () => {
			console.log("[mobile-handler] Hook unmounted");
		};
	}, [workspaceId]);
}
