import { isOrganizationMarketplace } from "@superset/shared/plugins";

interface Listed {
	name: string;
	marketplace: string;
	managed: boolean;
	latestVersion: string | null;
}

export function managedPluginsKey(plugins: Listed[]): string {
	return plugins
		.filter(
			(plugin) =>
				plugin.managed && isOrganizationMarketplace(plugin.marketplace),
		)
		.map(
			(plugin) =>
				`${plugin.marketplace}/${plugin.name}@${plugin.latestVersion ?? ""}`,
		)
		.sort()
		.join(",");
}
