import { sshHosts } from "@superset/local-db";
import { observable } from "@trpc/server/observable";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { getSshConnectionManager, parseSshConfig } from "main/lib/ssh";
import { z } from "zod";
import { publicProcedure, router } from "../..";

export function createSshHostsRouter() {
	const sshManager = getSshConnectionManager();

	return router({
		// List all SSH hosts
		list: publicProcedure.query(() => {
			return localDb.select().from(sshHosts).all();
		}),

		// Create a new SSH host
		create: publicProcedure
			.input(
				z.object({
					label: z.string().min(1),
					hostname: z.string().min(1),
					port: z.number().int().min(1).max(65535).default(22),
					username: z.string().min(1),
					authMethod: z.enum(["password", "privateKey", "agent"]),
					privateKeyPath: z.string().optional(),
					defaultDirectory: z.string().optional(),
				}),
			)
			.mutation(({ input }) => {
				const host = localDb
					.insert(sshHosts)
					.values({
						label: input.label,
						hostname: input.hostname,
						port: input.port,
						username: input.username,
						authMethod: input.authMethod,
						privateKeyPath: input.privateKeyPath ?? null,
						defaultDirectory: input.defaultDirectory ?? null,
					})
					.returning()
					.get();

				return host;
			}),

		// Update an SSH host
		update: publicProcedure
			.input(
				z.object({
					id: z.string(),
					label: z.string().min(1).optional(),
					hostname: z.string().min(1).optional(),
					port: z.number().int().min(1).max(65535).optional(),
					username: z.string().min(1).optional(),
					authMethod: z.enum(["password", "privateKey", "agent"]).optional(),
					privateKeyPath: z.string().nullable().optional(),
					defaultDirectory: z.string().nullable().optional(),
				}),
			)
			.mutation(({ input }) => {
				const { id, ...fields } = input;

				const host = localDb
					.update(sshHosts)
					.set(fields)
					.where(eq(sshHosts.id, id))
					.returning()
					.get();

				if (!host) {
					throw new Error(`SSH host ${id} not found`);
				}

				return host;
			}),

		// Delete an SSH host
		delete: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				// Disconnect if connected
				if (sshManager.isConnected(input.id)) {
					sshManager.disconnect(input.id);
				}

				localDb.delete(sshHosts).where(eq(sshHosts.id, input.id)).run();

				return { success: true };
			}),

		// Test SSH connection (without saving)
		testConnection: publicProcedure
			.input(
				z.object({
					hostname: z.string().min(1),
					port: z.number().int().default(22),
					username: z.string().min(1),
					authMethod: z.enum(["password", "privateKey", "agent"]),
					privateKeyPath: z.string().optional(),
					password: z.string().optional(),
					passphrase: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const result = await sshManager.testConnection(
					{
						id: "__test__",
						label: "test",
						hostname: input.hostname,
						port: input.port,
						username: input.username,
						authMethod: input.authMethod,
						privateKeyPath: input.privateKeyPath,
					},
					{
						password: input.password,
						passphrase: input.passphrase,
					},
				);

				return result;
			}),

		// Connect to a saved host
		connect: publicProcedure
			.input(
				z.object({
					id: z.string(),
					password: z.string().optional(),
					passphrase: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const host = localDb
					.select()
					.from(sshHosts)
					.where(eq(sshHosts.id, input.id))
					.get();

				if (!host) {
					throw new Error(`SSH host ${input.id} not found`);
				}

				await sshManager.connect(
					{
						id: host.id,
						label: host.label,
						hostname: host.hostname,
						port: host.port ?? 22,
						username: host.username,
						authMethod: host.authMethod as "password" | "privateKey" | "agent",
						privateKeyPath: host.privateKeyPath ?? undefined,
					},
					{
						password: input.password,
						passphrase: input.passphrase,
					},
				);

				localDb
					.update(sshHosts)
					.set({ lastConnectedAt: Date.now() })
					.where(eq(sshHosts.id, input.id))
					.run();

				return { success: true };
			}),

		// Disconnect from a host
		disconnect: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				sshManager.disconnect(input.id);
				return { success: true };
			}),

		// Get connection status for a host
		getConnectionStatus: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(({ input }) => {
				return { state: sshManager.getState(input.id) };
			}),

		// Subscribe to connection state changes
		onConnectionStateChange: publicProcedure.subscription(() => {
			return observable<{ hostId: string; state: string; error?: string }>(
				(emit) => {
					const handler = (hostId: string, state: string, error?: string) => {
						emit.next({ hostId, state, error });
					};

					sshManager.on("state-change", handler);

					return () => {
						sshManager.off("state-change", handler);
					};
				},
			);
		}),

		// Import hosts from ~/.ssh/config
		importFromConfig: publicProcedure.query(async () => {
			return parseSshConfig();
		}),

		// Browse remote directory (for path picker)
		browseRemoteDirectory: publicProcedure
			.input(
				z.object({
					hostId: z.string(),
					path: z.string().default("/"),
				}),
			)
			.query(async ({ input }) => {
				const sftp = await sshManager.getSftpClient(input.hostId);

				return new Promise<
					{ name: string; path: string; isDirectory: boolean }[]
				>((resolve, reject) => {
					sftp.readdir(input.path, (err, list) => {
						if (err) {
							reject(
								new Error(
									`Failed to read directory ${input.path}: ${err.message}`,
								),
							);
							return;
						}

						const entries = list
							.filter((entry) => {
								// d = directory
								return entry.attrs.mode !== undefined
									? (entry.attrs.mode & 0o170000) === 0o040000
									: false;
							})
							.map((entry) => ({
								name: entry.filename,
								path: `${input.path.replace(/\/$/, "")}/${entry.filename}`,
								isDirectory: true,
							}));

						resolve(entries);
					});
				});
			}),
	});
}

export type SshHostsRouter = ReturnType<typeof createSshHostsRouter>;
