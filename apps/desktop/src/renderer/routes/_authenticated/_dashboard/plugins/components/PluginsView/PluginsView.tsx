import { Trans, useLingui } from "@lingui/react/macro";
import {
	isPluginExternallyConfigured,
	PLUGIN_CATALOG,
	PLUGIN_CATEGORIES,
	type PluginCatalogEntry,
} from "@superset/shared/plugins";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { LuSearch, LuSettings2 } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { PluginIcon } from "renderer/routes/_authenticated/_dashboard/plugins/components/PluginIcon";
import { usePluginMutations } from "renderer/routes/_authenticated/_dashboard/plugins/hooks/usePluginMutations";
import { ManageInstalledDialog } from "./components/ManageInstalledDialog";
import { PluginCard } from "./components/PluginCard";
import { SkillsList } from "./components/SkillsList";

export function PluginsView() {
	const { t } = useLingui();
	const [search, setSearch] = useState("");
	const [isManageOpen, setIsManageOpen] = useState(false);
	const navigate = useNavigate();

	const { data: installed } = electronTrpc.plugins.listInstalled.useQuery();
	const installedNames = useMemo(
		() => new Set((installed ?? []).map((entry) => entry.name)),
		[installed],
	);
	const disabledNames = useMemo(
		() =>
			new Set(
				(installed ?? [])
					.filter((entry) => entry.enabled === false)
					.map((entry) => entry.name),
			),
		[installed],
	);
	const { data: externalServers } =
		electronTrpc.plugins.listExternalServers.useQuery();
	// One state: an install record OR the user's own config both count as
	// installed (having it = installed).
	const isInstalled = (plugin: PluginCatalogEntry) =>
		installedNames.has(plugin.name) ||
		isPluginExternallyConfigured(plugin, externalServers ?? []);

	const { install, uninstall, setEnabled, isBusy } = usePluginMutations();

	const handleOpen = (plugin: PluginCatalogEntry) => {
		navigate({
			to: "/plugins/$pluginName",
			params: { pluginName: plugin.name },
		});
	};

	const query = search.trim().toLowerCase();
	const visiblePlugins = useMemo(() => {
		if (query === "") return [...PLUGIN_CATALOG];
		return PLUGIN_CATALOG.filter((plugin) =>
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
	}, [query]);

	const installedPlugins = visiblePlugins.filter(isInstalled);
	const featured = visiblePlugins.filter((plugin) => plugin.featured);
	// Featured plugins appear in their category section too — Featured is a
	// spotlight, not a home.
	const byCategory = PLUGIN_CATEGORIES.map((category) => ({
		category,
		plugins: visiblePlugins.filter(
			(plugin) => plugin.interface.category === category,
		),
	})).filter(({ plugins }) => plugins.length > 0);

	const renderCard = (plugin: PluginCatalogEntry) => (
		<PluginCard
			key={plugin.name}
			plugin={plugin}
			isInstalled={isInstalled(plugin)}
			isDisabled={disabledNames.has(plugin.name)}
			isBusy={isBusy}
			onOpen={handleOpen}
			onInstall={(target) => install(target.name)}
			onUninstall={(target) => uninstall(target.name)}
			onSetEnabled={setEnabled}
		/>
	);

	return (
		<div className="mx-auto w-full max-w-3xl px-6 pb-16">
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

					{installedPlugins.length > 0 && (
						<section className="flex flex-col gap-3">
							<div className="flex items-center justify-between">
								<h2 className="text-sm font-semibold text-foreground">
									<Trans>Installed</Trans>
								</h2>
								<Tooltip delayDuration={300}>
									<TooltipTrigger asChild>
										<Button
											variant="ghost"
											size="icon-xs"
											className="text-muted-foreground"
											aria-label={t({
												message: "Manage plugins",
											})}
											onClick={() => setIsManageOpen(true)}
										>
											<LuSettings2 className="size-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										<Trans>Manage plugins</Trans>
									</TooltipContent>
								</Tooltip>
							</div>
							<div className="flex flex-wrap gap-2">
								{installedPlugins.map((plugin) => (
									<Tooltip key={plugin.name} delayDuration={300}>
										<TooltipTrigger asChild>
											<button
												type="button"
												aria-label={plugin.interface.displayName}
												onClick={() => handleOpen(plugin)}
												className={cn(
													disabledNames.has(plugin.name) && "opacity-40",
												)}
											>
												<PluginIcon
													pluginName={plugin.name}
													className="size-8"
												/>
											</button>
										</TooltipTrigger>
										<TooltipContent>
											{plugin.interface.displayName}
											{disabledNames.has(plugin.name) ? (
												<>
													{" "}
													<Trans>(disabled)</Trans>
												</>
											) : (
												""
											)}
										</TooltipContent>
									</Tooltip>
								))}
							</div>
						</section>
					)}

					{featured.length > 0 && (
						<section className="flex flex-col gap-3">
							<h2 className="text-sm font-semibold text-foreground">
								<Trans>Featured</Trans>
							</h2>
							<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
								{featured.map(renderCard)}
							</div>
						</section>
					)}

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

					{visiblePlugins.length === 0 && (
						<p className="py-8 text-center text-sm text-muted-foreground">
							<Trans>No plugins match "{search.trim()}"</Trans>
						</p>
					)}

					<ManageInstalledDialog
						open={isManageOpen}
						onOpenChange={setIsManageOpen}
						installed={installed ?? []}
						isBusy={isBusy}
						onSetEnabled={setEnabled}
						onUninstall={uninstall}
					/>
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
