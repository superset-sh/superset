import { observable } from "@trpc/server/observable";
import { dialog } from "electron";
import { db } from "main/lib/db";
import type { SSHConnection } from "main/lib/db/schemas";
import { sshManager } from "main/lib/ssh-manager";
import { nanoid } from "nanoid";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const sshCredentialsSchema = z
	.object({
		host: z.string().min(1),
		port: z.number().min(1).max(65535).default(22),
		username: z.string().min(1),
		authMethod: z.enum(["key", "password"]),
		privateKeyPath: z.string().optional(),
		password: z.string().optional(),
		passphrase: z.string().optional(),
	})
	.refine(
		(data) => {
			if (data.authMethod === "password") {
				return data.password && data.password.length > 0;
			}
			return true;
		},
		{
			message: "Password is required when using password authentication",
			path: ["password"],
		},
	)
	.refine(
		(data) => {
			if (data.authMethod === "key") {
				return data.privateKeyPath && data.privateKeyPath.length > 0;
			}
			return true;
		},
		{
			message: "Private key path is required when using key authentication",
			path: ["privateKeyPath"],
		},
	);

export const createSSHRouter = () => {
	return router({
		getConnections: publicProcedure.query((): SSHConnection[] => {
			return db.data.sshConnections
				.slice()
				.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
		}),

		getConnection: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(({ input }): SSHConnection | null => {
				return db.data.sshConnections.find((c) => c.id === input.id) ?? null;
			}),

		saveConnection: publicProcedure
			.input(
				z.object({
					name: z.string().min(1),
					host: z.string().min(1),
					port: z.number().min(1).max(65535).default(22),
					username: z.string().min(1),
					authMethod: z.enum(["key", "password"]),
					privateKeyPath: z.string().optional(),
				}),
			)
			.mutation(async ({ input }): Promise<SSHConnection> => {
				const existingIndex = db.data.sshConnections.findIndex(
					(c) =>
						c.host === input.host &&
						c.port === input.port &&
						c.username === input.username,
				);

				const now = Date.now();

				if (existingIndex !== -1) {
					await db.update((data) => {
						const connection = data.sshConnections[existingIndex];
						connection.name = input.name;
						connection.authMethod = input.authMethod;
						connection.privateKeyPath = input.privateKeyPath;
						connection.lastUsedAt = now;
					});
					return db.data.sshConnections[existingIndex];
				}

				const connection: SSHConnection = {
					id: nanoid(),
					name: input.name,
					host: input.host,
					port: input.port,
					username: input.username,
					authMethod: input.authMethod,
					privateKeyPath: input.privateKeyPath,
					lastUsedAt: now,
					createdAt: now,
				};

				await db.update((data) => {
					data.sshConnections.push(connection);
				});

				return connection;
			}),

		deleteConnection: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const index = db.data.sshConnections.findIndex(
					(c) => c.id === input.id,
				);
				if (index === -1) {
					return { success: false };
				}

				// Disconnect if currently connected
				sshManager.disconnect(input.id);

				await db.update((data) => {
					data.sshConnections.splice(index, 1);
				});

				return { success: true };
			}),

		testConnection: publicProcedure
			.input(sshCredentialsSchema)
			.mutation(
				async ({ input }): Promise<{ success: boolean; error?: string }> => {
					return sshManager.testConnection(input);
				},
			),

		connect: publicProcedure
			.input(
				z.object({
					connectionId: z.string(),
					credentials: sshCredentialsSchema,
				}),
			)
			.mutation(
				async ({ input }): Promise<{ success: boolean; error?: string }> => {
					const result = await sshManager.connect(input);

					if (result.success) {
						// Update last used time
						await db.update((data) => {
							const connection = data.sshConnections.find(
								(c) => c.id === input.connectionId,
							);
							if (connection) {
								connection.lastUsedAt = Date.now();
							}
						});
					}

					return result;
				},
			),

		disconnect: publicProcedure
			.input(z.object({ connectionId: z.string() }))
			.mutation(({ input }): { success: boolean } => {
				sshManager.disconnect(input.connectionId);
				return { success: true };
			}),

		isConnected: publicProcedure
			.input(z.object({ connectionId: z.string() }))
			.query(({ input }): boolean => {
				return sshManager.isConnected(input.connectionId);
			}),

		createShell: publicProcedure
			.input(
				z.object({
					tabId: z.string(),
					connectionId: z.string(),
					cwd: z.string().optional(),
					cols: z.number().optional(),
					rows: z.number().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				return sshManager.createShell(input);
			}),

		write: publicProcedure
			.input(z.object({ tabId: z.string(), data: z.string() }))
			.mutation(({ input }) => {
				sshManager.write(input);
			}),

		resize: publicProcedure
			.input(
				z.object({
					tabId: z.string(),
					cols: z.number(),
					rows: z.number(),
				}),
			)
			.mutation(({ input }) => {
				sshManager.resize(input);
			}),

		signal: publicProcedure
			.input(
				z.object({
					tabId: z.string(),
					signal: z.string().optional(),
				}),
			)
			.mutation(({ input }) => {
				sshManager.signal(input);
			}),

		kill: publicProcedure
			.input(z.object({ tabId: z.string() }))
			.mutation(async ({ input }) => {
				await sshManager.kill(input);
			}),

		getSession: publicProcedure.input(z.string()).query(({ input: tabId }) => {
			return sshManager.getSession(tabId);
		}),

		executeCommand: publicProcedure
			.input(
				z.object({
					connectionId: z.string(),
					command: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				return sshManager.executeCommand(input);
			}),

		listRemoteDirectory: publicProcedure
			.input(
				z.object({
					connectionId: z.string(),
					path: z.string(),
				}),
			)
			.query(async ({ input }) => {
				return sshManager.listRemoteDirectory(input);
			}),

		getRemoteHomeDir: publicProcedure
			.input(z.object({ connectionId: z.string() }))
			.query(async ({ input }) => {
				return sshManager.getRemoteHomeDir(input.connectionId);
			}),

		selectPrivateKey: publicProcedure.mutation(async () => {
			const result = await dialog.showOpenDialog({
				properties: ["openFile", "showHiddenFiles"],
				title: "Select SSH Private Key",
				defaultPath: `${process.env.HOME || "~"}/.ssh`,
				filters: [{ name: "All Files", extensions: ["*"] }],
			});

			if (result.canceled || result.filePaths.length === 0) {
				return { canceled: true };
			}

			return {
				canceled: false,
				path: result.filePaths[0],
			};
		}),

		stream: publicProcedure
			.input(z.string())
			.subscription(({ input: tabId }) => {
				return observable<
					| { type: "data"; data: string }
					| { type: "exit"; exitCode: number }
					| { type: "error"; message: string }
				>((emit) => {
					const onData = (data: string) => {
						emit.next({ type: "data", data });
					};

					const onExit = (exitCode: number) => {
						emit.next({ type: "exit", exitCode });
						emit.complete();
					};

					const onError = (message: string) => {
						emit.next({ type: "error", message });
					};

					sshManager.on(`data:${tabId}`, onData);
					sshManager.on(`exit:${tabId}`, onExit);
					sshManager.on(`error:${tabId}`, onError);

					return () => {
						sshManager.off(`data:${tabId}`, onData);
						sshManager.off(`exit:${tabId}`, onExit);
						sshManager.off(`error:${tabId}`, onError);
					};
				});
			}),
	});
};
