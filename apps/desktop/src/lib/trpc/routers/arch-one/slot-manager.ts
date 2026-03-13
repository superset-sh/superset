import { exec } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import simpleGit from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const execAsync = promisify(exec);

const REGISTRY_PATH = join(homedir(), ".alike-dev-slots.json");

interface SlotEntry {
	path: string;
	tmux_session: string;
	dead_since?: number;
}

interface Registry {
	slots: Record<string, SlotEntry | null>;
}

interface SlotInfo {
	slot: number;
	path: string | null;
	tmuxSession: string | null;
	branch: string | null;
	alive: boolean;
}

async function isTmuxAlive(session: string): Promise<boolean> {
	try {
		await execAsync(`tmux has-session -t ${session} 2>/dev/null`);
		return true;
	} catch {
		return false;
	}
}

async function getBranch(path: string): Promise<string | null> {
	try {
		const git = simpleGit(path);
		return (await git.branch()).current || null;
	} catch {
		return null;
	}
}

export const createSlotManagerRouter = () => {
	return router({
		getSlotStatus: publicProcedure.query(async (): Promise<SlotInfo[]> => {
			let registry: Registry;
			try {
				const text = await readFile(REGISTRY_PATH, "utf-8");
				registry = JSON.parse(text) as Registry;
			} catch {
				return Array.from({ length: 4 }, (_, i) => ({
					slot: i + 1,
					path: null,
					tmuxSession: null,
					branch: null,
					alive: false,
				}));
			}

			const slots: SlotInfo[] = [];
			for (let i = 1; i <= 4; i++) {
				const entry = registry.slots[String(i)];
				if (entry) {
					const [alive, branch] = await Promise.all([
						isTmuxAlive(entry.tmux_session),
						getBranch(entry.path),
					]);
					slots.push({
						slot: i,
						path: entry.path,
						tmuxSession: entry.tmux_session,
						branch,
						alive,
					});
				} else {
					slots.push({
						slot: i,
						path: null,
						tmuxSession: null,
						branch: null,
						alive: false,
					});
				}
			}
			return slots;
		}),

		allocateSlot: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ slot: number | null; error: string | null }> => {
				try {
					const { stdout } = await execAsync(
						`npx deno run --allow-all scripts/slot-alloc.ts allocate "${input.worktreePath}"`,
						{ cwd: input.worktreePath, timeout: 30_000 },
					);
					// Parse the slot number from stdout (e.g. "Acquired slot 2")
					const match = stdout.match(/slot\s+(\d+)/i);
					return { slot: match ? Number(match[1]) : null, error: null };
				} catch (err) {
					const message = err instanceof Error ? err.message : "Allocation failed";
					// Check if slots are full
					if (message.includes("__SLOTS_FULL__") || message.includes("All slots occupied")) {
						return { slot: null, error: "All slots are occupied" };
					}
					return { slot: null, error: message };
				}
			}),

		killSlot: publicProcedure
			.input(
				z.object({
					tmuxSession: z.string(),
					path: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				// Kill the tmux session
				try {
					await execAsync(`tmux kill-session -t ${input.tmuxSession}`);
				} catch {
					// Session may already be dead
				}

				// Release the slot
				try {
					await execAsync(
						`npx deno run --allow-all scripts/slot-alloc.ts release "${input.path}" --force`,
						{ cwd: input.path, timeout: 15_000 },
					);
				} catch {
					// Best effort — slot may already be freed
				}

				return { killed: true };
			}),
	});
};
