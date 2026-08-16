import { z } from "zod";

export const PLUGIN_MANIFEST_FILENAME = "superset-plugin.json";

/**
 * Plugin ids are globally unique, lowercase, dot-namespaced
 * (`author.plugin-name`). The character set keeps ids safe as directory
 * names, URL segments, and event keys without escaping.
 */
export const pluginIdSchema = z
	.string()
	.min(3)
	.max(120)
	.regex(
		/^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/,
		"plugin id must be lowercase dot-namespaced, e.g. `acme.review-board`",
	);

const commandRunSchema = z.discriminatedUnion("type", [
	// Invokes a backend action registered via `api.actions.register`.
	z.object({ type: z.literal("action"), action: z.string().min(1) }),
	// Opens one of the plugin's contributed sidebar tabs.
	z.object({ type: z.literal("open-sidebar-tab"), tabId: z.string().min(1) }),
	// Opens (or focuses) one of the plugin's contributed pane kinds.
	z.object({ type: z.literal("open-pane"), kind: z.string().min(1) }),
]);

const commandContributionSchema = z.object({
	id: z.string().min(1).max(120),
	title: z.string().min(1).max(200),
	description: z.string().max(500).optional(),
	run: commandRunSchema,
});

const sidebarTabContributionSchema = z.object({
	id: z.string().min(1).max(64),
	label: z.string().min(1).max(40),
	/** Named export of the plugin's app bundle rendered as the tab content. */
	component: z.string().min(1),
});

const paneContributionSchema = z.object({
	/** Pane kind, must be prefixed with the plugin id (`acme.board.pane`). */
	kind: z.string().min(1).max(160),
	title: z.string().min(1).max(60),
	/** Named export of the plugin's app bundle rendered as the pane content. */
	component: z.string().min(1),
});

/**
 * Low-volume lifecycle events a plugin may hook. High-volume streams
 * (terminal output, fs events) are deliberately not hookable.
 */
export const PLUGIN_EVENT_KINDS = [
	"workspace.created",
	"workspace.updated",
	"workspace.deleted",
	"project.created",
	"project.updated",
	"project.deleted",
	"agent.lifecycle",
	"terminal.exit",
	"port.added",
	"port.removed",
] as const;

export type PluginEventKind = (typeof PLUGIN_EVENT_KINDS)[number];

const eventHookContributionSchema = z.object({
	on: z.enum(PLUGIN_EVENT_KINDS),
	/** argv array spawned with SUPERSET_PLUGIN_* env-injected context. */
	command: z.array(z.string().min(1)).min(1),
});

const relativeEntrySchema = z
	.string()
	.min(1)
	.max(512)
	.refine(
		(p) =>
			!p.startsWith("/") && !p.startsWith("~") && !p.split("/").includes(".."),
		"entry paths must be relative to the plugin root without `..` segments",
	);

export const pluginManifestSchema = z.object({
	id: pluginIdSchema,
	name: z.string().min(1).max(120),
	version: z
		.string()
		.regex(/^\d+\.\d+\.\d+(-[0-9A-Za-z-.]+)?$/, "version must be semver"),
	description: z.string().max(500).optional(),
	minSupersetVersion: z
		.string()
		.regex(/^\d+\.\d+\.\d+$/)
		.optional(),
	platforms: z
		.array(z.enum(["macos", "linux", "windows"]))
		.min(1)
		.optional(),
	/** Declared capabilities, shown at install time. Enforcement is server-side. */
	permissions: z.array(z.string().min(1).max(120)).optional(),
	/** Backend entry (TS or JS), loaded in-process by the host-service. */
	server: relativeEntrySchema.optional(),
	/** Prebuilt ESM bundle of React slot components (`superset plugin build`). */
	app: relativeEntrySchema.optional(),
	contributes: z
		.object({
			commands: z.array(commandContributionSchema).max(50).optional(),
			sidebarTabs: z.array(sidebarTabContributionSchema).max(10).optional(),
			panes: z.array(paneContributionSchema).max(10).optional(),
			themes: z.array(relativeEntrySchema).max(20).optional(),
			events: z.array(eventHookContributionSchema).max(50).optional(),
		})
		.optional(),
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;
export type PluginCommandContribution = z.infer<
	typeof commandContributionSchema
>;
export type PluginSidebarTabContribution = z.infer<
	typeof sidebarTabContributionSchema
>;
export type PluginPaneContribution = z.infer<typeof paneContributionSchema>;
export type PluginEventHookContribution = z.infer<
	typeof eventHookContributionSchema
>;

export interface ParsedPluginManifest {
	manifest: PluginManifest;
	warnings: string[];
}

/**
 * Parse and validate a manifest object (already JSON-parsed). Throws a
 * readable Error on invalid manifests; returns non-fatal warnings (e.g. a
 * pane kind not prefixed with the plugin id) for the installer to surface.
 */
export function parsePluginManifest(raw: unknown): ParsedPluginManifest {
	const result = pluginManifestSchema.safeParse(raw);
	if (!result.success) {
		const issues = result.error.issues
			.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
			.join("; ");
		throw new Error(`Invalid ${PLUGIN_MANIFEST_FILENAME}: ${issues}`);
	}
	const manifest = result.data;
	const warnings: string[] = [];
	for (const pane of manifest.contributes?.panes ?? []) {
		if (!pane.kind.startsWith(`${manifest.id}.`)) {
			warnings.push(
				`pane kind "${pane.kind}" should be prefixed with the plugin id`,
			);
		}
	}
	if (
		(manifest.contributes?.sidebarTabs?.length ||
			manifest.contributes?.panes?.length) &&
		!manifest.app
	) {
		throw new Error(
			`Invalid ${PLUGIN_MANIFEST_FILENAME}: UI contributions require an "app" bundle entry`,
		);
	}
	for (const command of manifest.contributes?.commands ?? []) {
		const run = command.run;
		if (run.type === "open-sidebar-tab") {
			const tabs = manifest.contributes?.sidebarTabs ?? [];
			if (!tabs.some((t) => t.id === run.tabId)) {
				throw new Error(
					`Invalid ${PLUGIN_MANIFEST_FILENAME}: command "${command.id}" opens unknown sidebar tab "${run.tabId}"`,
				);
			}
		}
		if (run.type === "open-pane") {
			const panes = manifest.contributes?.panes ?? [];
			if (!panes.some((p) => p.kind === run.kind)) {
				throw new Error(
					`Invalid ${PLUGIN_MANIFEST_FILENAME}: command "${command.id}" opens unknown pane kind "${run.kind}"`,
				);
			}
		}
	}
	return { manifest, warnings };
}
