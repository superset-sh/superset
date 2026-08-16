import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { InstalledCheckout } from "../../../plugins/install";
import {
	installFromGit,
	installFromPath,
	linkFromPath,
	removeManagedCheckout,
} from "../../../plugins/install";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, router } from "../../index";

function requirePluginServices(ctx: HostServiceContext) {
	const { pluginRuntime, pluginStore } = ctx;
	if (!pluginRuntime || !pluginStore) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "Plugin runtime is not available on this host",
		});
	}
	return { pluginRuntime, pluginStore };
}

async function registerCheckout(
	ctx: HostServiceContext,
	checkout: InstalledCheckout,
) {
	const { pluginRuntime, pluginStore } = requirePluginServices(ctx);
	const { manifest, warnings } = checkout.parsed;
	pluginStore.upsert({
		id: manifest.id,
		name: manifest.name,
		version: manifest.version,
		description: manifest.description ?? null,
		sourceType: checkout.sourceType,
		source: checkout.source,
		sourceCommit: checkout.sourceCommit,
		manifestJson: JSON.stringify(manifest),
	});
	await pluginRuntime.reload(manifest.id);
	const snapshot = pluginRuntime
		.list()
		.find((plugin) => plugin.id === manifest.id);
	return { snapshot, warnings };
}

export const pluginsRouter = router({
	list: protectedProcedure.query(({ ctx }) => {
		const { pluginRuntime } = requirePluginServices(ctx);
		return pluginRuntime.list();
	}),

	install: protectedProcedure
		.meta({ timeoutMs: 180_000 })
		.input(
			z.discriminatedUnion("type", [
				z.object({ type: z.literal("path"), path: z.string().min(1) }),
				z.object({
					type: z.literal("git"),
					url: z.string().min(1),
					ref: z.string().min(1).optional(),
				}),
			]),
		)
		.mutation(async ({ ctx, input }) => {
			const checkout =
				input.type === "path"
					? await installFromPath(input.path)
					: await installFromGit(input.url, input.ref);
			return registerCheckout(ctx, checkout);
		}),

	link: protectedProcedure
		.input(z.object({ path: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			const checkout = await linkFromPath(input.path);
			return registerCheckout(ctx, checkout);
		}),

	setEnabled: protectedProcedure
		.input(z.object({ id: z.string().min(1), enabled: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			const { pluginRuntime, pluginStore } = requirePluginServices(ctx);
			if (!pluginStore.get(input.id)) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Plugin not installed: ${input.id}`,
				});
			}
			pluginStore.setEnabled(input.id, input.enabled);
			if (input.enabled) {
				await pluginRuntime.reload(input.id);
			} else {
				await pluginRuntime.unload(input.id);
			}
		}),

	uninstall: protectedProcedure
		.input(z.object({ id: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			const { pluginRuntime, pluginStore } = requirePluginServices(ctx);
			const row = pluginStore.get(input.id);
			if (!row) return;
			await pluginRuntime.unload(input.id);
			pluginStore.remove(input.id);
			if (row.sourceType !== "link") {
				await removeManagedCheckout(input.id);
			}
		}),

	reload: protectedProcedure
		.input(z.object({ id: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			const { pluginRuntime, pluginStore } = requirePluginServices(ctx);
			const row = pluginStore.get(input.id);
			if (!row) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Plugin not installed: ${input.id}`,
				});
			}
			// Linked dev plugins may have edited their manifest; re-read it so
			// the reload picks up new contributions, not just new code.
			if (row.sourceType === "link") {
				const checkout = await linkFromPath(row.source);
				return registerCheckout(ctx, checkout);
			}
			await pluginRuntime.reload(input.id);
			return {
				snapshot: pluginRuntime.list().find((p) => p.id === input.id),
				warnings: [],
			};
		}),

	invokeAction: protectedProcedure
		.meta({ timeoutMs: 15_000 })
		.input(
			z.object({
				id: z.string().min(1),
				action: z.string().min(1),
				params: z.unknown().optional(),
				workspaceId: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { pluginRuntime } = requirePluginServices(ctx);
			try {
				return await pluginRuntime.invokeAction(
					input.id,
					input.action,
					input.params ?? null,
					{ workspaceId: input.workspaceId },
				);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}),

	getAppBundle: protectedProcedure
		.input(z.object({ id: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			const { pluginRuntime } = requirePluginServices(ctx);
			return pluginRuntime.getAppBundle(input.id);
		}),
});
