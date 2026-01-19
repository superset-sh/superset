import crypto from "node:crypto";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { observable } from "@trpc/server/observable";
import { EventEmitter } from "node:events";
import { env } from "main/env.main";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { loadToken } from "../auth/utils/auth-functions";

const execAsync = promisify(exec);

/**
 * Mobile pairing and relay for the desktop app.
 *
 * Handles:
 * - QR code generation for pairing
 * - SSE connection to relay server
 * - Receiving and executing mobile commands
 */

// Event emitter for mobile commands
export const mobileEvents = new EventEmitter();

// Active session
let activeSessionId: string | null = null;
let activeProjectPath: string | null = null;

interface MobileCommand {
	id: string;
	transcript: string;
	targetType: "terminal" | "claude" | "task";
	targetId: string | null;
	createdAt: string;
}

/**
 * Generate a unique desktop instance ID
 */
function getDesktopInstanceId(): string {
	// Use a combination of machine-specific info and random bytes
	// In production, this could be stored persistently
	return `desktop-${crypto.randomBytes(8).toString("hex")}`;
}

// Polling state
let pollingInterval: NodeJS.Timeout | null = null;
const POLL_INTERVAL_MS = 2000;

/**
 * Execute a terminal command and return the output
 * Note: Claude commands are handled separately via terminal write (to support existing sessions)
 */
async function executeTerminalCommand(command: MobileCommand): Promise<string> {
	const cwd = activeProjectPath || process.cwd();
	const shellCommand = command.transcript;

	console.log("[mobile] Executing terminal command:", { shellCommand, cwd });

	try {
		const { stdout, stderr } = await execAsync(shellCommand, {
			cwd,
			timeout: 60000, // 60 second timeout
			maxBuffer: 1024 * 1024, // 1MB buffer
			env: { ...process.env, FORCE_COLOR: "0" }, // Disable colors for cleaner output
		});

		const output = (stdout + (stderr ? `\n${stderr}` : "")).trim();
		console.log("[mobile] Command output length:", output.length);
		return output || "(no output)";
	} catch (err: unknown) {
		const error = err as { stdout?: string; stderr?: string; message?: string };
		// Command failed but might still have output
		const output = (error.stdout || "") + (error.stderr || "");
		if (output.trim()) {
			return output.trim();
		}
		return `Error: ${error.message || "Command failed"}`;
	}
}

/**
 * Send command response back to server
 */
async function sendCommandResponse(commandId: string, response: string): Promise<void> {
	const url = `${env.NEXT_PUBLIC_WEB_URL}/api/mobile/commands`;
	console.log("[mobile] Sending response to:", url);
	console.log("[mobile] Command ID:", commandId);
	console.log("[mobile] Response preview:", response.substring(0, 200));

	try {
		const res = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				commandId,
				status: "executed",
				response: response.substring(0, 50000), // Limit response size
			}),
		});

		if (!res.ok) {
			const errorText = await res.text();
			console.error("[mobile] Failed to send response:", res.status, errorText);
		} else {
			console.log("[mobile] Response sent successfully");
		}
	} catch (err) {
		console.error("[mobile] Failed to send response (network error):", err);
	}
}

// Track when polling started to distinguish "not yet paired" from "expired"
let pollingStartTime: number | null = null;
// How long to wait for mobile to scan QR before considering it expired
const PAIRING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Poll for mobile commands from the server
 * Note: Uses WEB_URL since /api/mobile/commands is in the web app, not the API
 */
async function pollForCommands(sessionId: string): Promise<void> {
	try {
		const commandsUrl = new URL(`${env.NEXT_PUBLIC_WEB_URL}/api/mobile/commands`);
		commandsUrl.searchParams.set("sessionId", sessionId);

		const response = await fetch(commandsUrl.toString());

		if (!response.ok) {
			if (response.status === 401) {
				// Check if we've been waiting too long for pairing
				const waitTime = pollingStartTime ? Date.now() - pollingStartTime : 0;
				if (waitTime > PAIRING_TIMEOUT_MS) {
					console.log("[mobile] Session expired after", Math.round(waitTime / 1000), "seconds, stopping poll");
					disconnectFromRelay();
					mobileEvents.emit("disconnected");
					return;
				}
				// Session not paired yet, keep waiting
				console.log("[mobile] Session not paired yet, waiting... (", Math.round(waitTime / 1000), "s)");
				return;
			}
			console.error("[mobile] Poll failed:", response.status);
			return;
		}

		const data = await response.json();
		const commands = data.commands as MobileCommand[];

		if (commands.length > 0) {
			console.log("[mobile] Received", commands.length, "command(s)");
		}

		// Process each command
		for (const command of commands) {
			console.log("[mobile] Processing command:", {
				id: command.id,
				targetType: command.targetType,
				transcript: command.transcript.substring(0, 50),
			});

			// Emit event for UI/renderer handling
			mobileEvents.emit("command", command);

			if (command.targetType === "claude") {
				// Claude commands are handled by the renderer (writes to existing Claude session in terminal)
				// The renderer will capture output and send response via useMobileCommandHandler
				console.log("[mobile] Claude command delegated to renderer");
			} else {
				// Terminal commands: execute directly and send response
				const output = await executeTerminalCommand(command);
				console.log("[mobile] Command executed, output length:", output.length);

				// Send response back to server (this also marks as executed)
				await sendCommandResponse(command.id, output);
				console.log("[mobile] Response sent for command:", command.id);
			}
		}
	} catch (err) {
		console.error("[mobile] Poll error:", err);
	}
}

/**
 * Start polling for mobile commands
 */
function startPolling(sessionId: string, projectPath?: string): void {
	// Stop any existing polling
	stopPolling();

	activeSessionId = sessionId;
	activeProjectPath = projectPath || null;
	pollingStartTime = Date.now();
	console.log("[mobile] Starting command polling for session:", sessionId, "path:", projectPath);
	mobileEvents.emit("connected");

	// Poll immediately, then at interval
	pollForCommands(sessionId);
	pollingInterval = setInterval(() => {
		pollForCommands(sessionId);
	}, POLL_INTERVAL_MS);
}

/**
 * Stop polling for commands
 */
function stopPolling(): void {
	if (pollingInterval) {
		clearInterval(pollingInterval);
		pollingInterval = null;
	}
	activeSessionId = null;
	activeProjectPath = null;
	pollingStartTime = null;
}

/**
 * Disconnect from the relay server (stop polling)
 */
function disconnectFromRelay(): void {
	stopPolling();
	mobileEvents.emit("disconnected");
}

export const createMobileRouter = () => {
	// Log environment on router creation for debugging
	console.log("[mobile] Router initialized with:", {
		WEB_URL: env.NEXT_PUBLIC_WEB_URL,
		API_URL: env.NEXT_PUBLIC_API_URL,
	});

	return router({
		/**
		 * Generate a QR code for pairing with mobile
		 */
		generatePairingQR: publicProcedure
			.input(
				z.object({
					workspaceId: z.string().optional(),
					workspaceName: z.string().optional(),
					projectPath: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const { token } = await loadToken();
				if (!token) {
					return { success: false, error: "Not authenticated" };
				}

				try {
					// Call the cloud API to create a pairing session
					const response = await fetch(
						`${env.NEXT_PUBLIC_API_URL}/api/trpc/mobile.createPairingSession`,
						{
							method: "POST",
							headers: {
								Authorization: `Bearer ${token}`,
								"Content-Type": "application/json",
							},
							body: JSON.stringify({
								json: {
									desktopInstanceId: getDesktopInstanceId(),
									activeWorkspaceId: input.workspaceId,
									activeWorkspaceName: input.workspaceName,
									activeProjectPath: input.projectPath,
								},
							}),
						},
					);

					if (!response.ok) {
						const error = await response.text();
						console.error("[mobile] Failed to create pairing session:", error);
						return { success: false, error: "Failed to create pairing session" };
					}

					const data = await response.json();
					const { sessionId, pairingToken, expiresAt } = data.result.data.json;

					// Generate QR code data URL
					// Format: superset://pair?token=XXX
					const qrData =
						env.NODE_ENV === "development"
							? `superset-dev://pair?token=${pairingToken}`
							: `superset://pair?token=${pairingToken}`;

					// Start polling for commands on this session
					startPolling(sessionId, input.projectPath);

					return {
						success: true,
						qrData,
						pairingToken,
						sessionId,
						expiresAt,
					};
				} catch (err) {
					console.error("[mobile] Error generating QR:", err);
					return {
						success: false,
						error: err instanceof Error ? err.message : "Unknown error",
					};
				}
			}),

		/**
		 * Start listening for mobile commands on a pairing session
		 */
		startRelayConnection: publicProcedure
			.input(z.object({ sessionId: z.string(), projectPath: z.string().optional() }))
			.mutation(({ input }) => {
				// Start polling for commands
				startPolling(input.sessionId, input.projectPath);
				return { success: true };
			}),

		/**
		 * Stop the relay connection
		 */
		stopRelayConnection: publicProcedure.mutation(() => {
			disconnectFromRelay();
			return { success: true };
		}),

		/**
		 * Get current relay connection status
		 */
		getRelayStatus: publicProcedure.query(() => {
			return {
				connected: pollingInterval !== null,
				sessionId: activeSessionId,
			};
		}),

		/**
		 * Subscribe to mobile commands
		 */
		onMobileCommand: publicProcedure.subscription(() => {
			return observable<MobileCommand>((emit) => {
				const handler = (command: MobileCommand) => {
					emit.next(command);
				};

				mobileEvents.on("command", handler);

				return () => {
					mobileEvents.off("command", handler);
				};
			});
		}),

		/**
		 * Subscribe to connection status changes
		 */
		onConnectionChange: publicProcedure.subscription(() => {
			return observable<{ connected: boolean }>((emit) => {
				const connectedHandler = () => {
					emit.next({ connected: true });
				};
				const disconnectedHandler = () => {
					emit.next({ connected: false });
				};

				mobileEvents.on("connected", connectedHandler);
				mobileEvents.on("disconnected", disconnectedHandler);

				// Emit initial state
				emit.next({ connected: pollingInterval !== null });

				return () => {
					mobileEvents.off("connected", connectedHandler);
					mobileEvents.off("disconnected", disconnectedHandler);
				};
			});
		}),

		/**
		 * Acknowledge a command was executed
		 * Note: Uses WEB_URL since /api/mobile/commands is in the web app
		 */
		acknowledgeCommand: publicProcedure
			.input(
				z.object({
					commandId: z.string(),
					success: z.boolean(),
					error: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const status = input.success ? "executed" : "failed";
				const url = `${env.NEXT_PUBLIC_WEB_URL}/api/mobile/commands`;
				await fetch(url, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						commandId: input.commandId,
						status,
						error: input.error,
					}),
				});
				return { success: true };
			}),

		/**
		 * Send command response (terminal output) back to mobile
		 * Note: Uses WEB_URL since /api/mobile/commands is in the web app
		 */
		sendCommandResponse: publicProcedure
			.input(
				z.object({
					commandId: z.string(),
					response: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const url = `${env.NEXT_PUBLIC_WEB_URL}/api/mobile/commands`;
				console.log("[mobile] Sending command response:", {
					commandId: input.commandId,
					responseLength: input.response.length,
				});
				await fetch(url, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						commandId: input.commandId,
						response: input.response,
						status: "executed",
					}),
				});
				return { success: true };
			}),
	});
};

export type MobileRouter = ReturnType<typeof createMobileRouter>;
