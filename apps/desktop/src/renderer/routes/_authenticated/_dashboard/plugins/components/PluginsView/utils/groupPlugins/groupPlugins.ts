import {
	isOrganizationMarketplace,
	PLUGIN_CATEGORIES,
	type PluginCategory,
} from "@superset/shared/plugins";

interface Groupable {
	marketplace: string;
	interface: { category: PluginCategory };
}

export function groupPlugins<T extends Groupable>(plugins: T[]) {
	const organization = plugins.filter((plugin) =>
		isOrganizationMarketplace(plugin.marketplace),
	);
	const rest = plugins.filter(
		(plugin) => !isOrganizationMarketplace(plugin.marketplace),
	);
	const categories = PLUGIN_CATEGORIES.map((category) => ({
		category,
		plugins: rest.filter((plugin) => plugin.interface.category === category),
	})).filter(({ plugins }) => plugins.length > 0);
	return { organization, categories };
}
