import {
	PLUGIN_CATALOG,
	PLUGIN_CATEGORIES,
	type PluginCatalogEntry,
} from "@superset/shared/plugins";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMemo, useState } from "react";
import { LuSearch } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { posthog } from "renderer/lib/posthog";
import { PluginCard } from "./components/PluginCard";
import { PluginIcon } from "./components/PluginIcon";
import { SkillsList } from "./components/SkillsList";

/** Scopes mirror the Codex marketplace model; only Public ships in the MVP. */
const COMING_SOON_SCOPES = ["Superset", "Personal"] as const;

export function PluginsView() {
	const [search, setSearch] = useState("");

	const utils = electronTrpc.useUtils();
	const { data: installed } = electronTrpc.plugins.listInstalled.useQuery();
	const installedNames = useMemo(
		() => new Set((installed ?? []).map((entry) => entry.name)),
		[installed],
	);

	const installMutation = electronTrpc.plugins.install.useMutation({
		onSuccess: (_data, variables) => {
			void utils.plugins.listInstalled.invalidate();
			posthog.capture("plugin_installed", { plugin: variables.name });
		},
		onError: (error) => {
			toast.error("Install failed", { description: error.message });
		},
	});
	const uninstallMutation = electronTrpc.plugins.uninstall.useMutation({
		onSuccess: (_data, variables) => {
			void utils.plugins.listInstalled.invalidate();
			posthog.capture("plugin_uninstalled", { plugin: variables.name });
		},
		onError: (error) => {
			toast.error("Uninstall failed", { description: error.message });
		},
	});
	const isBusy = installMutation.isPending || uninstallMutation.isPending;

	const handleInstall = (plugin: PluginCatalogEntry) => {
		installMutation.mutate(
			{ name: plugin.name },
			{
				onSuccess: () => {
					toast.success(`${plugin.interface.displayName} installed`, {
						description: "Takes effect in new agent sessions.",
					});
				},
			},
		);
	};

	const handleUninstall = (plugin: PluginCatalogEntry) => {
		uninstallMutation.mutate(
			{ name: plugin.name },
			{
				onSuccess: () => {
					toast.success(`${plugin.interface.displayName} uninstalled`);
				},
			},
		);
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

	const installedPlugins = visiblePlugins.filter((plugin) =>
		installedNames.has(plugin.name),
	);
	const featured = visiblePlugins.filter((plugin) => plugin.featured);
	const byCategory = PLUGIN_CATEGORIES.map((category) => ({
		category,
		plugins: visiblePlugins.filter(
			(plugin) => !plugin.featured && plugin.interface.category === category,
		),
	})).filter(({ plugins }) => plugins.length > 0);

	const renderCard = (plugin: PluginCatalogEntry) => (
		<PluginCard
			key={plugin.name}
			plugin={plugin}
			isInstalled={installedNames.has(plugin.name)}
			isBusy={isBusy}
			onInstall={handleInstall}
			onUninstall={handleUninstall}
		/>
	);

	return (
		<div className="mx-auto w-full max-w-3xl px-6 pb-16">
			<Tabs defaultValue="plugins">
				<TabsList className="mb-6">
					<TabsTrigger value="plugins">Plugins</TabsTrigger>
					<TabsTrigger value="skills">Skills</TabsTrigger>
				</TabsList>

				<TabsContent value="plugins" className="flex flex-col gap-6">
					<div>
						<h1 className="text-2xl font-semibold text-foreground">Plugins</h1>
						<p className="mt-1 text-sm text-muted-foreground">
							Work with your agents across your favorite tools
						</p>
					</div>

					<div className="relative">
						<LuSearch className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder="Search plugins"
							className="rounded-full pl-9"
						/>
					</div>

					{installedPlugins.length > 0 && (
						<section className="flex flex-col gap-3">
							<h2 className="text-sm font-semibold text-foreground">
								Installed
							</h2>
							<div className="flex flex-wrap gap-2">
								{installedPlugins.map((plugin) => (
									<Tooltip key={plugin.name} delayDuration={300}>
										<TooltipTrigger asChild>
											<span>
												<PluginIcon
													pluginName={plugin.name}
													className="size-8"
												/>
											</span>
										</TooltipTrigger>
										<TooltipContent>
											{plugin.interface.displayName}
										</TooltipContent>
									</Tooltip>
								))}
							</div>
						</section>
					)}

					<div className="flex items-center gap-1.5">
						<span className="rounded-full bg-fill-selected px-3 py-1 text-xs font-medium text-foreground">
							Public
						</span>
						{COMING_SOON_SCOPES.map((scope) => (
							<Tooltip key={scope} delayDuration={300}>
								<TooltipTrigger asChild>
									<span
										className={cn(
											"cursor-default rounded-full px-3 py-1 text-xs font-medium",
											"text-muted-foreground/60",
										)}
									>
										{scope}
									</span>
								</TooltipTrigger>
								<TooltipContent>Coming soon</TooltipContent>
							</Tooltip>
						))}
					</div>

					{featured.length > 0 && (
						<section className="flex flex-col gap-3">
							<h2 className="text-sm font-semibold text-foreground">
								Featured
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
							No plugins match "{search.trim()}"
						</p>
					)}
				</TabsContent>

				<TabsContent value="skills" className="flex flex-col gap-6">
					<div>
						<h1 className="text-2xl font-semibold text-foreground">Skills</h1>
						<p className="mt-1 text-sm text-muted-foreground">
							Reusable instructions your agents pick up automatically
						</p>
					</div>
					<SkillsList />
				</TabsContent>
			</Tabs>
		</div>
	);
}
