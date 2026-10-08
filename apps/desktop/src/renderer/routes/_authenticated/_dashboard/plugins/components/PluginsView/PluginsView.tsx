import { Trans, useLingui } from "@lingui/react/macro";
import { PLUGIN_CATEGORIES } from "@superset/shared/plugins";
import { Input } from "@superset/ui/input";
import { Skeleton } from "@superset/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { LuSearch } from "react-icons/lu";
import {
	type CatalogPlugin,
	usePluginCatalog,
} from "renderer/hooks/usePluginCatalog";
import { usePluginMutations } from "renderer/routes/_authenticated/_dashboard/plugins/hooks/usePluginMutations";
import { PluginCard } from "./components/PluginCard";
import { SkillsList } from "./components/SkillsList";

export function PluginsView() {
	const { t } = useLingui();
	const [search, setSearch] = useState("");
	const navigate = useNavigate();

	const {
		plugins: catalog,
		isLoading: isCatalogLoading,
		error: catalogError,
	} = usePluginCatalog();

	const isConnected = (plugin: CatalogPlugin) =>
		plugin.installed && (!plugin.connector || plugin.connections.length > 0);

	const { add, uninstall, setEnabled, update, isBusy } = usePluginMutations();

	const handleOpen = (plugin: CatalogPlugin) => {
		navigate({
			to: "/plugins/$pluginName",
			params: { pluginName: plugin.name },
		});
	};

	const query = search.trim().toLowerCase();
	const visiblePlugins = useMemo(() => {
		const all: CatalogPlugin[] = catalog;
		if (query === "") return all;
		return all.filter((plugin) =>
			[
				plugin.name,
				plugin.interface.displayName,
				plugin.description,
				plugin.interface.category,
			]
				.join(" ")
				.toLowerCase()
				.includes(query),
		);
	}, [query, catalog]);

	const byCategory = PLUGIN_CATEGORIES.map((category) => ({
		category,
		plugins: visiblePlugins.filter(
			(plugin) => plugin.interface.category === category,
		),
	})).filter(({ plugins }) => plugins.length > 0);

	const skeletonCards = (
		<section className="flex flex-col gap-3">
			<Skeleton className="h-5 w-24" />
			<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
				{Array.from({ length: 6 }, (_, index) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
						key={index}
						className="flex items-center gap-3 rounded-lg p-3"
					>
						<Skeleton className="size-9 shrink-0 rounded-lg" />
						<div className="flex min-w-0 flex-1 flex-col gap-1.5">
							<Skeleton className="h-4 w-28" />
							<Skeleton className="h-3 w-full max-w-56" />
						</div>
					</div>
				))}
			</div>
		</section>
	);

	const renderCard = (plugin: CatalogPlugin) => (
		<PluginCard
			key={plugin.name}
			plugin={plugin}
			isInstalled={plugin.installed}
			isConnected={isConnected(plugin)}
			isDisabled={plugin.installed && !plugin.enabled}
			isBusy={isBusy}
			onOpen={handleOpen}
			onInstall={(target) => void add(target.name)}
			onUninstall={(target) => uninstall(target.name)}
			onSetEnabled={setEnabled}
			onUpdate={(name) => void update(name)}
		/>
	);

	return (
		<div className="mx-auto w-full max-w-3xl px-6 pt-4 pb-16">
			<Tabs defaultValue="plugins">
				<TabsList className="mb-6">
					<TabsTrigger value="plugins">
						<Trans>Plugins</Trans>
					</TabsTrigger>
					<TabsTrigger value="skills">
						<Trans>Skills</Trans>
					</TabsTrigger>
				</TabsList>

				<TabsContent value="plugins" className="flex flex-col gap-6">
					<div>
						<h1 className="text-2xl font-semibold text-foreground">
							<Trans>Plugins</Trans>
						</h1>
						<p className="mt-1 text-sm text-muted-foreground">
							<Trans>Work with your agents across your favorite tools</Trans>
						</p>
					</div>

					<div className="relative">
						<LuSearch className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder={t({
								message: "Search plugins",
							})}
							className="rounded-full pl-9"
						/>
					</div>

					{isCatalogLoading && skeletonCards}

					{byCategory.map(({ category, plugins }) => (
						<section key={category} className="flex flex-col gap-3">
							<h2 className="text-sm font-semibold text-foreground">
								{category}
							</h2>
							<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
								{plugins.map(renderCard)}
							</div>
						</section>
					))}

					{visiblePlugins.length === 0 && query !== "" && (
						<p className="py-8 text-center text-sm text-muted-foreground">
							<Trans>No plugins match "{search.trim()}"</Trans>
						</p>
					)}

					{catalogError && (
						<p className="py-8 text-center text-sm text-muted-foreground">
							<Trans>
								Could not load plugins. Check your connection and try again.
							</Trans>
						</p>
					)}

					{!catalogError &&
						!isCatalogLoading &&
						catalog.length === 0 &&
						query === "" && (
							<p className="py-8 text-center text-sm text-muted-foreground">
								<Trans>No plugins available yet.</Trans>
							</p>
						)}
				</TabsContent>

				<TabsContent value="skills" className="flex flex-col gap-6">
					<div>
						<h1 className="text-2xl font-semibold text-foreground">
							<Trans>Skills</Trans>
						</h1>
						<p className="mt-1 text-sm text-muted-foreground">
							<Trans>
								Reusable instructions your agents pick up automatically
							</Trans>
						</p>
					</div>
					<SkillsList />
				</TabsContent>
			</Tabs>
		</div>
	);
}
