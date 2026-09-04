import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	getPluginByName,
	isPluginExternallyConfigured,
} from "@superset/shared/plugins";
import { toast } from "@superset/ui/sonner";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { posthog } from "renderer/lib/posthog";

const displayName = (name: string) =>
	getPluginByName(name)?.interface.displayName ?? name;

/** Install/uninstall/toggle with shared toasts, analytics, and invalidation. */
export function usePluginMutations() {
	const { t } = useLingui();
	const utils = electronTrpc.useUtils();
	const invalidate = () => {
		void utils.plugins.listInstalled.invalidate();
		void utils.plugins.listExternalServers.invalidate();
	};
	// Uninstall/disable only ever remove what Superset wrote; when the user's
	// own entries also provide this plugin, say so instead of implying it's gone.
	const handWrittenRemains = (name: string) => {
		const plugin = getPluginByName(name);
		const external = utils.plugins.listExternalServers.getData() ?? [];
		return plugin !== undefined
			? isPluginExternallyConfigured(plugin, external)
			: false;
	};

	const installMutation = electronTrpc.plugins.install.useMutation({
		onSuccess: (_data, variables) => {
			invalidate();
			posthog.capture("plugin_installed", { plugin: variables.name });
			toast.success(
				t({
					message: `${displayName(variables.name)} installed`,
				}),
				{
					description: t({
						message: "Takes effect in new agent sessions.",
					}),
				},
			);
		},
		onError: (error) => {
			toast.error(
				t({
					message: "Install failed",
				}),
				{ description: errorMessage(error) },
			);
		},
	});
	const uninstallMutation = electronTrpc.plugins.uninstall.useMutation({
		onSuccess: (_data, variables) => {
			const remains = handWrittenRemains(variables.name);
			invalidate();
			posthog.capture("plugin_uninstalled", { plugin: variables.name });
			toast.success(
				t({
					message: `${displayName(variables.name)} uninstalled`,
				}),
				remains
					? {
							description: t({
								message:
									"Entries you added yourself stay in your agent config.",
							}),
						}
					: undefined,
			);
		},
		onError: (error) => {
			toast.error(
				t({
					message: "Uninstall failed",
				}),
				{ description: errorMessage(error) },
			);
		},
	});
	const setEnabledMutation = electronTrpc.plugins.setEnabled.useMutation({
		onSuccess: (_data, variables) => {
			const remains = !variables.enabled && handWrittenRemains(variables.name);
			invalidate();
			posthog.capture(
				variables.enabled ? "plugin_enabled" : "plugin_disabled",
				{ plugin: variables.name },
			);
			toast.success(
				variables.enabled
					? t({
							message: `${displayName(variables.name)} enabled`,
						})
					: t({
							message: `${displayName(variables.name)} disabled`,
						}),
				{
					description: remains
						? t({
								message:
									"Entries you added yourself stay active in your agent config.",
							})
						: t({
								message: "Takes effect in new agent sessions.",
							}),
				},
			);
		},
		onError: (error) => {
			toast.error(
				t({
					message: "Could not update plugin",
				}),
				{
					description: errorMessage(error),
				},
			);
		},
	});

	return {
		install: (name: string) => installMutation.mutate({ name }),
		uninstall: (name: string) => uninstallMutation.mutate({ name }),
		setEnabled: (name: string, enabled: boolean) =>
			setEnabledMutation.mutate({ name, enabled }),
		isBusy:
			installMutation.isPending ||
			uninstallMutation.isPending ||
			setEnabledMutation.isPending,
	};
}
