import { mkdir, readFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { lock } from "proper-lockfile";
import type { HostDb } from "../../../../db";
import { provisionClaudeAccount } from "../account-provisioning";
import {
	getDefaultAccountSelections,
	setDefaultAccountSelection,
} from "../default-account";
import { switchClaudeRuntimeAccount } from "./runtime";
import {
	claudeRuntimeDirectory,
	createClaudeRuntimeStorage,
	writePrivateFile,
} from "./storage";

let pending: Promise<unknown> = Promise.resolve();

export function activateClaudeRuntimeAccount(
	db: HostDb,
	selection: string | null,
): Promise<number> {
	const next = pending.then(async () => {
		const directory = claudeRuntimeDirectory();
		await mkdir(dirname(directory), { recursive: true, mode: 0o700 });
		const release = await lock(directory, {
			realpath: false,
			stale: 60_000,
			retries: { retries: 5, minTimeout: 100, maxTimeout: 500 },
		});
		try {
			await provisionClaudeAccount(directory);
			const previousSelection = getDefaultAccountSelections(db).claudeConfigDir;
			let previousMarker: string | null = null;
			try {
				previousMarker = await readFile(join(directory, "selection"), "utf8");
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
			let previousEnabledAt: string | null = null;
			let runtimeStartedAt = Date.now();
			try {
				previousEnabledAt = await readFile(
					join(directory, "enabled-at"),
					"utf8",
				);
				runtimeStartedAt = Number(previousEnabledAt);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
			const startsNewRuntime =
				previousEnabledAt === null ||
				previousMarker !== (previousSelection ?? "");
			if (!Number.isFinite(runtimeStartedAt) || runtimeStartedAt <= 0)
				throw new Error("Invalid Claude runtime activation time.");
			await switchClaudeRuntimeAccount(
				createClaudeRuntimeStorage({
					profileDirectories: [selection, previousSelection].filter(
						(value): value is string => value !== null,
					),
				}),
				selection,
				async () => {
					try {
						await writePrivateFile(
							join(directory, "selection"),
							selection ?? "",
						);
						setDefaultAccountSelection(db, "claude", selection);
						if (startsNewRuntime) runtimeStartedAt = Date.now();
						await writePrivateFile(
							join(directory, "enabled-at"),
							String(runtimeStartedAt),
						);
					} catch (error) {
						const restorations = await Promise.allSettled([
							...(
								[
									["selection", previousMarker],
									["enabled-at", previousEnabledAt],
								] as const
							).map(async ([name, contents]) => {
								if (contents === null)
									await unlink(join(directory, name)).catch(
										(error: NodeJS.ErrnoException) => {
											if (error.code !== "ENOENT") throw error;
										},
									);
								else await writePrivateFile(join(directory, name), contents);
							}),
							Promise.resolve().then(() =>
								setDefaultAccountSelection(db, "claude", previousSelection),
							),
						]);
						const failures = restorations.filter(
							(result) => result.status === "rejected",
						);
						if (failures.length > 0)
							throw new AggregateError(
								[error, ...failures.map((result) => result.reason)],
								"Claude account switch rollback failed.",
							);
						throw error;
					}
				},
			);
			return runtimeStartedAt;
		} finally {
			await release();
		}
	});
	pending = next.catch(() => {});
	return next;
}
