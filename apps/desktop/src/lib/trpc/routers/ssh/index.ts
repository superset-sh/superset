/**
 * SSH Router
 *
 * tRPC router for managing SSH connections and remote workspaces.
 * Provides CRUD operations for SSH connections and integration with
 * the workspace runtime registry.
 */

import {
	remoteProjects,
	remoteWorkspaces,
	sshConnections,
	SSH_AUTH_METHODS,
} from "@superset/local-db";
import { TRPCError } from "@trpc/server";
import { eq, desc } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import {
	getWorkspaceRuntimeRegistry,
	type ExtendedWorkspaceRuntimeRegistry,
} from "main/lib/workspace-runtime/registry";
import { getSSHConfigHosts, hasSSHConfig } from "main/lib/ssh";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { observable } from "@trpc/server/observable";

// Get the registry with SSH support
function getRegistry(): ExtendedWorkspaceRuntimeRegistry {
	return getWorkspaceRuntimeRegistry();
}

// SSH Connection input schema
const sshConnectionInput = z.object({
	name: z.string().min(1, "Name is required"),
	host: z.string().min(1, "Host is required"),
	port: z.number().min(1).max(65535).default(22),
	username: z.string().min(1, "Username is required"),
	authMethod: z.enum(SSH_AUTH_METHODS),
	privateKeyPath: z.string().optional(),
	agentForward: z.boolean().optional(),
	remoteWorkDir: z.string().optional(),
	keepAliveInterval: z.number().optional(),
	connectionTimeout: z.number().optional(),
});

export const createSSHRouter = () => {
	return router({
		// =================================================================
		// SSH Connection Management
		// =================================================================

		/**
		 * List all SSH connections
		 */
		listConnections: publicProcedure.query(() => {
			return localDb
				.select()
				.from(sshConnections)
				.orderBy(desc(sshConnections.lastConnectedAt))
				.all();
		}),

		/**
		 * Get a single SSH connection by ID
		 */
		getConnection: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(({ input }) => {
				const connection = localDb
					.select()
					.from(sshConnections)
					.where(eq(sshConnections.id, input.id))
					.get();

				if (!connection) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `SSH connection ${input.id} not found`,
					});
				}

				return connection;
			}),

		/**
		 * Create a new SSH connection
		 */
		createConnection: publicProcedure
			.input(sshConnectionInput)
			.mutation(({ input }) => {
				const connection = localDb
					.insert(sshConnections)
					.values(input)
					.returning()
					.get();

				console.log(`[ssh/router] Created SSH connection: ${connection.name} (${connection.host})`);
				return connection;
			}),

		/**
		 * Update an SSH connection
		 */
		updateConnection: publicProcedure
			.input(
				z.object({
					id: z.string(),
					patch: sshConnectionInput.partial(),
				}),
			)
			.mutation(async ({ input }) => {
				const existing = localDb
					.select()
					.from(sshConnections)
					.where(eq(sshConnections.id, input.id))
					.get();

				if (!existing) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `SSH connection ${input.id} not found`,
					});
				}

				// If the connection is active, disconnect it first
				const registry = getRegistry();
				await registry.disconnectSSHRuntime(input.id);

				const updated = localDb
					.update(sshConnections)
					.set(input.patch)
					.where(eq(sshConnections.id, input.id))
					.returning()
					.get();

				console.log(`[ssh/router] Updated SSH connection: ${updated.name}`);
				return updated;
			}),

		/**
		 * Delete an SSH connection
		 */
		deleteConnection: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ input }) => {
				const registry = getRegistry();

				// Disconnect the runtime if active
				await registry.disconnectSSHRuntime(input.id);

				// Delete associated remote projects (cascades to remote workspaces)
				localDb
					.delete(remoteProjects)
					.where(eq(remoteProjects.sshConnectionId, input.id))
					.run();

				// Delete the connection
				localDb
					.delete(sshConnections)
					.where(eq(sshConnections.id, input.id))
					.run();

				console.log(`[ssh/router] Deleted SSH connection: ${input.id}`);
				return { success: true };
			}),

		/**
		 * Test SSH connection
		 */
		testConnection: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ input }) => {
				const connection = localDb
					.select()
					.from(sshConnections)
					.where(eq(sshConnections.id, input.id))
					.get();

				if (!connection) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `SSH connection ${input.id} not found`,
					});
				}

				const registry = getRegistry();
				const runtime = registry.getSSHRuntime({
					id: connection.id,
					name: connection.name,
					host: connection.host,
					port: connection.port,
					username: connection.username,
					authMethod: connection.authMethod,
					privateKeyPath: connection.privateKeyPath ?? undefined,
					agentForward: connection.agentForward ?? undefined,
					remoteWorkDir: connection.remoteWorkDir ?? undefined,
					keepAliveInterval: connection.keepAliveInterval ?? undefined,
					connectionTimeout: connection.connectionTimeout ?? undefined,
				});

				try {
					await runtime.connect();

					// Update last connected time
					localDb
						.update(sshConnections)
						.set({ lastConnectedAt: Date.now() })
						.where(eq(sshConnections.id, input.id))
						.run();

					return { success: true, message: "Connection successful" };
				} catch (error) {
					const message = error instanceof Error ? error.message : "Unknown error";
					return { success: false, message };
				}
			}),

		/**
		 * Connect to an SSH server
		 */
		connect: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ input }) => {
				console.log(`[ssh/router] Connect requested for connection: ${input.id}`);

				const connection = localDb
					.select()
					.from(sshConnections)
					.where(eq(sshConnections.id, input.id))
					.get();

				if (!connection) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `SSH connection ${input.id} not found`,
					});
				}

				console.log(`[ssh/router] Found connection: ${connection.name} (${connection.username}@${connection.host})`);

				const registry = getRegistry();
				const runtime = registry.getSSHRuntime({
					id: connection.id,
					name: connection.name,
					host: connection.host,
					port: connection.port,
					username: connection.username,
					authMethod: connection.authMethod,
					privateKeyPath: connection.privateKeyPath ?? undefined,
					agentForward: connection.agentForward ?? undefined,
					remoteWorkDir: connection.remoteWorkDir ?? undefined,
					keepAliveInterval: connection.keepAliveInterval ?? undefined,
					connectionTimeout: connection.connectionTimeout ?? undefined,
				});

				try {
					console.log(`[ssh/router] Attempting to connect...`);
					await runtime.connect();
					console.log(`[ssh/router] Connected to ${connection.name}`);
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					console.error(`[ssh/router] Connection failed: ${message}`);
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: `Failed to connect: ${message}`,
					});
				}

				// Update last connected time
				localDb
					.update(sshConnections)
					.set({ lastConnectedAt: Date.now() })
					.where(eq(sshConnections.id, input.id))
					.run();

				return { success: true };
			}),

		/**
		 * Disconnect from an SSH server
		 */
		disconnect: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ input }) => {
				const registry = getRegistry();
				await registry.disconnectSSHRuntime(input.id);
				console.log(`[ssh/router] Disconnected from ${input.id}`);
				return { success: true };
			}),

		/**
		 * Get connection status
		 */
		getConnectionStatus: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(({ input }) => {
				const registry = getRegistry();
				const runtimes = registry.getActiveSSHRuntimes();
				const runtime = runtimes.get(input.id);

				if (!runtime) {
					return { connected: false, state: "disconnected" as const };
				}

				return {
					connected: runtime.isConnected(),
					state: runtime.isConnected() ? "connected" as const : "disconnected" as const,
				};
			}),

		/**
		 * Subscribe to connection status changes
		 */
		onConnectionStatus: publicProcedure
			.input(z.object({ id: z.string() }))
			.subscription(({ input }) => {
				return observable<{ state: string; error?: string }>((emit) => {
					const registry = getRegistry();
					const runtime = registry.getActiveSSHRuntimes().get(input.id);

					if (!runtime) {
						emit.next({ state: "disconnected" });
						return () => {};
					}

					const handler = (status: { state: string; error?: string }) => {
						emit.next(status);
					};

					runtime.terminal.on("connectionStatus", handler);

					// Send initial state
					emit.next({
						state: runtime.isConnected() ? "connected" : "disconnected",
					});

					return () => {
						runtime.terminal.off("connectionStatus", handler);
					};
				});
			}),

		// =================================================================
		// Remote Project Management
		// =================================================================

		/**
		 * List all remote projects
		 */
		listRemoteProjects: publicProcedure.query(() => {
			return localDb
				.select()
				.from(remoteProjects)
				.orderBy(desc(remoteProjects.lastOpenedAt))
				.all();
		}),

		/**
		 * List remote projects for a specific SSH connection
		 */
		listRemoteProjectsByConnection: publicProcedure
			.input(z.object({ sshConnectionId: z.string() }))
			.query(({ input }) => {
				return localDb
					.select()
					.from(remoteProjects)
					.where(eq(remoteProjects.sshConnectionId, input.sshConnectionId))
					.orderBy(desc(remoteProjects.lastOpenedAt))
					.all();
			}),

		/**
		 * Create a remote project
		 */
		createRemoteProject: publicProcedure
			.input(
				z.object({
					sshConnectionId: z.string(),
					remotePath: z.string().min(1, "Remote path is required"),
					name: z.string().min(1, "Name is required"),
					color: z.string().default("#6366f1"),
					defaultBranch: z.string().optional(),
				}),
			)
			.mutation(({ input }) => {
				// Verify SSH connection exists
				const connection = localDb
					.select()
					.from(sshConnections)
					.where(eq(sshConnections.id, input.sshConnectionId))
					.get();

				if (!connection) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `SSH connection ${input.sshConnectionId} not found`,
					});
				}

				const project = localDb
					.insert(remoteProjects)
					.values(input)
					.returning()
					.get();

				console.log(`[ssh/router] Created remote project: ${project.name} at ${project.remotePath}`);
				return project;
			}),

		/**
		 * Delete a remote project
		 */
		deleteRemoteProject: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ input }) => {
				// Get all workspaces for this project
				const workspaces = localDb
					.select()
					.from(remoteWorkspaces)
					.where(eq(remoteWorkspaces.remoteProjectId, input.id))
					.all();

				// Unregister workspaces from SSH
				const registry = getRegistry();
				for (const ws of workspaces) {
					registry.unregisterSSHWorkspace(ws.id);
				}

				// Delete project (cascades to workspaces)
				localDb
					.delete(remoteProjects)
					.where(eq(remoteProjects.id, input.id))
					.run();

				console.log(`[ssh/router] Deleted remote project: ${input.id}`);
				return { success: true };
			}),

		// =================================================================
		// Remote Workspace Management
		// =================================================================

		/**
		 * List remote workspaces for a project
		 */
		listRemoteWorkspaces: publicProcedure
			.input(z.object({ remoteProjectId: z.string() }))
			.query(({ input }) => {
				return localDb
					.select()
					.from(remoteWorkspaces)
					.where(eq(remoteWorkspaces.remoteProjectId, input.remoteProjectId))
					.orderBy(remoteWorkspaces.tabOrder)
					.all();
			}),

		/**
		 * Create a remote workspace
		 */
		createRemoteWorkspace: publicProcedure
			.input(
				z.object({
					remoteProjectId: z.string(),
					branch: z.string().min(1, "Branch is required"),
					name: z.string().min(1, "Name is required"),
				}),
			)
			.mutation(({ input }) => {
				// Verify remote project exists and get SSH connection
				const project = localDb
					.select()
					.from(remoteProjects)
					.where(eq(remoteProjects.id, input.remoteProjectId))
					.get();

				if (!project) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Remote project ${input.remoteProjectId} not found`,
					});
				}

				// Get max tab order
				const maxOrder = localDb
					.select()
					.from(remoteWorkspaces)
					.where(eq(remoteWorkspaces.remoteProjectId, input.remoteProjectId))
					.all()
					.reduce((max, ws) => Math.max(max, ws.tabOrder), -1);

				const workspace = localDb
					.insert(remoteWorkspaces)
					.values({
						...input,
						tabOrder: maxOrder + 1,
					})
					.returning()
					.get();

				// Register workspace with SSH runtime
				const registry = getRegistry();
				registry.registerSSHWorkspace(workspace.id, project.sshConnectionId);

				console.log(`[ssh/router] Created remote workspace: ${workspace.name}`);
				return workspace;
			}),

		/**
		 * Delete a remote workspace
		 */
		deleteRemoteWorkspace: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				const registry = getRegistry();
				registry.unregisterSSHWorkspace(input.id);

				localDb
					.delete(remoteWorkspaces)
					.where(eq(remoteWorkspaces.id, input.id))
					.run();

				console.log(`[ssh/router] Deleted remote workspace: ${input.id}`);
				return { success: true };
			}),

		/**
		 * Open a remote project - connects to SSH and returns the first workspace
		 */
		openRemoteProject: publicProcedure
			.input(z.object({ projectId: z.string() }))
			.mutation(async ({ input }) => {
				// Get the remote project
				const project = localDb
					.select()
					.from(remoteProjects)
					.where(eq(remoteProjects.id, input.projectId))
					.get();

				if (!project) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Remote project ${input.projectId} not found`,
					});
				}

				// Get the SSH connection
				const connection = localDb
					.select()
					.from(sshConnections)
					.where(eq(sshConnections.id, project.sshConnectionId))
					.get();

				if (!connection) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `SSH connection for project not found`,
					});
				}

				// Get or create the SSH runtime and connect
				const registry = getRegistry();
				const runtime = registry.getSSHRuntime({
					id: connection.id,
					name: connection.name,
					host: connection.host,
					port: connection.port,
					username: connection.username,
					authMethod: connection.authMethod,
					privateKeyPath: connection.privateKeyPath ?? undefined,
					agentForward: connection.agentForward ?? undefined,
					remoteWorkDir: project.remotePath,
					keepAliveInterval: connection.keepAliveInterval ?? undefined,
					connectionTimeout: connection.connectionTimeout ?? undefined,
				});

				// Connect if not already connected
				if (!runtime.isConnected()) {
					try {
						await runtime.connect();
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						throw new TRPCError({
							code: "INTERNAL_SERVER_ERROR",
							message: `Failed to connect to SSH: ${message}`,
						});
					}
				}

				// Get or create a workspace for this project
				let workspace = localDb
					.select()
					.from(remoteWorkspaces)
					.where(eq(remoteWorkspaces.remoteProjectId, project.id))
					.orderBy(remoteWorkspaces.lastOpenedAt)
					.get();

				if (!workspace) {
					// Create a default workspace
					workspace = localDb
						.insert(remoteWorkspaces)
						.values({
							remoteProjectId: project.id,
							branch: "main",
							name: "main",
							tabOrder: 0,
						})
						.returning()
						.get();
					console.log(`[ssh/router] Created default workspace for project: ${project.name}`);
				}

				// Register workspace with SSH runtime
				registry.registerSSHWorkspace(workspace.id, connection.id);

				// Update last opened time
				localDb
					.update(remoteProjects)
					.set({ lastOpenedAt: Date.now() })
					.where(eq(remoteProjects.id, project.id))
					.run();

				localDb
					.update(remoteWorkspaces)
					.set({ lastOpenedAt: Date.now() })
					.where(eq(remoteWorkspaces.id, workspace.id))
					.run();

				console.log(`[ssh/router] Opened remote project: ${project.name}, workspace: ${workspace.id}`);
				return { project, workspace };
			}),

		/**
		 * Get active SSH runtimes
		 */
		getActiveRuntimes: publicProcedure.query(() => {
			const registry = getRegistry();
			const runtimes = registry.getActiveSSHRuntimes();

			return Array.from(runtimes.entries()).map(([id, runtime]) => ({
				id,
				connected: runtime.isConnected(),
				config: runtime.getConfig(),
			}));
		}),

		// =================================================================
		// SSH Config Import
		// =================================================================

		/**
		 * Check if ~/.ssh/config exists
		 */
		hasSSHConfig: publicProcedure.query(() => {
			return hasSSHConfig();
		}),

		/**
		 * Get hosts from ~/.ssh/config (without importing)
		 */
		getSSHConfigHosts: publicProcedure.query(() => {
			return getSSHConfigHosts();
		}),

		/**
		 * Import hosts from ~/.ssh/config into the database
		 */
		importFromSSHConfig: publicProcedure
			.input(
				z.object({
					/** Specific host names to import, or empty to import all */
					hostNames: z.array(z.string()).optional(),
					/** Skip hosts that already exist (by name) */
					skipExisting: z.boolean().default(true),
				}).optional(),
			)
			.mutation(({ input }) => {
				const options = input ?? {};
				const configHosts = getSSHConfigHosts();

				// Get existing connection names for deduplication
				const existingNames = new Set(
					localDb
						.select({ name: sshConnections.name })
						.from(sshConnections)
						.all()
						.map((c) => c.name.toLowerCase()),
				);

				// Filter hosts to import
				let hostsToImport = configHosts;

				if (options.hostNames && options.hostNames.length > 0) {
					const namesSet = new Set(options.hostNames.map((n) => n.toLowerCase()));
					hostsToImport = hostsToImport.filter((h) =>
						namesSet.has(h.name.toLowerCase()),
					);
				}

				if (options.skipExisting) {
					hostsToImport = hostsToImport.filter(
						(h) => !existingNames.has(h.name.toLowerCase()),
					);
				}

				// Import the hosts
				const imported: string[] = [];
				const skipped: string[] = [];

				for (const host of hostsToImport) {
					try {
						localDb
							.insert(sshConnections)
							.values({
								name: host.name,
								host: host.host,
								port: host.port,
								username: host.username,
								authMethod: host.authMethod,
								privateKeyPath: host.privateKeyPath,
								agentForward: host.agentForward,
							})
							.run();
						imported.push(host.name);
						console.log(`[ssh/router] Imported SSH host: ${host.name}`);
					} catch (error) {
						console.error(`[ssh/router] Failed to import ${host.name}:`, error);
						skipped.push(host.name);
					}
				}

				return {
					imported,
					skipped,
					total: configHosts.length,
				};
			}),
	});
};
