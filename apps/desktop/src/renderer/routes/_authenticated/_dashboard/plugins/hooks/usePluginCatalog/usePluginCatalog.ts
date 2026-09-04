import type {
	PluginCatalogEntry,
	PluginCategory,
} from "@superset/shared/plugins";
import type { RouterOutputs } from "@superset/trpc";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

type CatalogRow = RouterOutputs["plugins"]["list"][number];

export type AuthMethod = CatalogRow["authMethods"][number];
export type AuthInput = AuthMethod["inputs"][number];
export type PluginSkill = CatalogRow["skills"][number];

export interface CatalogPlugin extends Omit<PluginCatalogEntry, "auth"> {
	auth?: readonly AuthMethod[];
	marketplace: string;
	installed: boolean;
	latestVersion: string | null;
	updateAvailable: boolean;
	enabled: boolean;
	accounts: string[];
	connections: CatalogRow["connections"];
	pluginSkills: PluginSkill[];
	homepage: string | null;
	author: string | null;
	license: string | null;
}

function toCatalogPlugin(plugin: CatalogRow): CatalogPlugin {
	return {
		name: plugin.name,
		version: plugin.version,
		description: plugin.description,
		interface: {
			displayName: plugin.displayName,
			category: plugin.category as PluginCategory,
		},
		mcpServers: plugin.mcpUrl
			? { [plugin.name]: { type: "http" as const, url: plugin.mcpUrl } }
			: {},
		auth: plugin.authMethods.length ? plugin.authMethods : undefined,
		skills: plugin.skills.map((skill) => skill.name),
		marketplace: plugin.marketplace,
		installed: plugin.installed,
		latestVersion: plugin.latestVersion,
		updateAvailable:
			plugin.installed &&
			plugin.latestVersion !== null &&
			plugin.latestVersion !== plugin.version,
		enabled: plugin.enabled,
		accounts: plugin.accounts,
		connections: plugin.connections,
		pluginSkills: plugin.skills,
		homepage: plugin.homepage,
		author: plugin.author,
		license: plugin.license,
	};
}

export function usePluginCatalog() {
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id ?? null;

	const query = cloudTrpc.plugins.list.useQuery(undefined, {
		enabled: Boolean(userId),
	});

	return {
		plugins: (query.data ?? []).map(toCatalogPlugin),
		isLoading: query.isLoading,
		error: query.error,
	};
}
