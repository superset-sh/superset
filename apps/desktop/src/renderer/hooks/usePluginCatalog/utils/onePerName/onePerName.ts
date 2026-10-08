interface Listed {
	name: string;
	marketplace: string;
	installed: boolean;
}

const FIRST_PARTY = "superset";

function rank(plugin: Listed): number {
	return (
		(plugin.installed ? 0 : 2) + (plugin.marketplace === FIRST_PARTY ? 0 : 1)
	);
}

export function onePerName<T extends Listed>(plugins: T[]): T[] {
	const kept = new Map<string, T>();
	for (const plugin of plugins) {
		const current = kept.get(plugin.name);
		if (!current || rank(plugin) < rank(current)) {
			kept.set(plugin.name, plugin);
		}
	}
	return plugins.filter((plugin) => kept.get(plugin.name) === plugin);
}
