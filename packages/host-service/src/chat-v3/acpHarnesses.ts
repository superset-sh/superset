import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { HarnessFactory } from "@superset/chat-runtime";
import { createAcpAdapter } from "@superset/chat-runtime";
import type { HostDb } from "../db";
import { resolveAttachmentPath } from "../trpc/router/attachments/storage";
import { ACP_HARNESSES } from "./acpCatalogue";
import { resolveAgentCli } from "./agentCli";
import { buildChatAgentEnv } from "./agentEnv";
import type { ChatAgentBridge } from "./chatAgentBridge";

async function resolveAttachment(attachmentId: string) {
	const resolved = resolveAttachmentPath(attachmentId);
	if (!resolved) return null;
	return {
		path: resolved.path,
		mimeType: resolved.metadata.mediaType,
		data: (await readFile(resolved.path)).toString("base64"),
	};
}

function resolveAdapterEntry(packageName: string): string {
	const moduleRequire = createRequire(import.meta.url);
	const pkgJson = moduleRequire.resolve(`${packageName}/package.json`);
	return join(dirname(pkgJson), "dist/index.js");
}

export function acpHarnessFactory(
	harness: string,
	db: HostDb,
	agents?: ChatAgentBridge,
): HarnessFactory | null {
	const entry = ACP_HARNESSES[harness];
	if (!entry) return null;

	let adapterEntry: string | undefined;
	if (entry.adapter) {
		try {
			adapterEntry = resolveAdapterEntry(entry.adapter);
		} catch {
			return null;
		}
	}

	return (options) =>
		createAcpAdapter({
			command: entry.binary,
			cwd: options.cwd,
			resolveAttachment,
			...(entry.fullAccessModeId
				? { defaultModeId: entry.fullAccessModeId }
				: {}),
			onSpawn: (pid) => agents?.spawned(options.sessionId, pid),
			launch: async () => {
				const cli = await resolveAgentCli({
					binary: entry.binary,
					minVersion: entry.minVersion,
					upgrade: entry.upgrade,
					env: () =>
						buildChatAgentEnv({
							db,
							cwd: options.cwd,
							workspaceId: options.scopeId,
							terminalId: options.terminalId,
						}),
				});
				const env = cli.env;
				if (!adapterEntry) {
					return { command: cli.command, args: entry.args, env };
				}
				if (!entry.executableEnv) {
					throw new Error(
						`${harness} bundles a translator with no way to point it at ${entry.binary}`,
					);
				}
				return {
					command: process.execPath,
					args: [adapterEntry, ...(entry.args ?? [])],
					env: {
						...env,
						ELECTRON_RUN_AS_NODE: "1",
						[entry.executableEnv]: cli.command,
					},
				};
			},
		});
}

export function acpHarnessEntries(
	db: HostDb,
	agents?: ChatAgentBridge,
): [string, HarnessFactory][] {
	const entries: [string, HarnessFactory][] = [];
	for (const harness of Object.keys(ACP_HARNESSES)) {
		const factory = acpHarnessFactory(harness, db, agents);
		if (factory) entries.push([harness, factory]);
	}
	return entries;
}
