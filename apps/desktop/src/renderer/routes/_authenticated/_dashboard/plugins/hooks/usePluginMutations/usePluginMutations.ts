import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { getPluginByName } from "@superset/shared/plugins";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { posthog } from "renderer/lib/posthog";

const displayName = (name: string) =>
	getPluginByName(name)?.interface.displayName ?? name;

/** Install/uninstall/toggle with shared toasts, analytics, and invalidation. */
export function usePluginMutations() {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();
	const navigate = useNavigate();

	const accountInstall = cloudTrpc.plugins.install.useMutation();
	const accountUninstall = cloudTrpc.plugins.uninstall.useMutation();
	const accountSetEnabled = cloudTrpc.plugins.setEnabled.useMutation();

	const invalidate = async () => {
		await Promise.all([
			utils.plugins.list.invalidate(),
			utils.plugins.connections.list.invalidate(),
		]);
	};

	const syncAccount = async (
		name: string,
		action: "install" | "uninstall",
	): Promise<boolean> => {
		try {
			if (action === "install") await accountInstall.mutateAsync({ name });
			else await accountUninstall.mutateAsync({ name });
			return true;
		} catch (error) {
			toast.warning(
				t({
					message: `${displayName(name)} is set up on this machine, but not on your account`,
				}),
				{ description: errorMessage(error) },
			);
			return false;
		} finally {
			await invalidate();
		}
	};

	const installMutation = electronTrpc.plugins.install.useMutation({
		onSuccess: (_data, variables) => {
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
		onSuccess: async (_data, variables) => {
			await syncAccount(variables.name, "uninstall");
			posthog.capture("plugin_uninstalled", { plugin: variables.name });
			toast.success(
				t({
					message: `${displayName(variables.name)} uninstalled`,
				}),
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
		onSuccess: async (_data, variables) => {
			try {
				await accountSetEnabled.mutateAsync({
					name: variables.name,
					enabled: variables.enabled,
				});
			} catch (error) {
				toast.warning(
					t({
						message: `${displayName(variables.name)} is set up on this machine, but not on your account`,
					}),
					{ description: errorMessage(error) },
				);
			} finally {
				await invalidate();
			}
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
					description: t({
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

	const updateMutation = electronTrpc.plugins.install.useMutation({
		onSuccess: (_data, variables) => {
			posthog.capture("plugin_updated", { plugin: variables.name });
			toast.success(
				t({
					message: `${displayName(variables.name)} updated`,
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
					message: "Could not update plugin",
				}),
				{ description: errorMessage(error) },
			);
		},
	});

	const add = async (name: string): Promise<boolean> => {
		navigate({ to: "/plugins/$pluginName", params: { pluginName: name } });
		await installMutation.mutateAsync({ name });
		return await syncAccount(name, "install");
	};

	const update = async (name: string): Promise<boolean> => {
		await updateMutation.mutateAsync({ name });
		return await syncAccount(name, "install");
	};

	return {
		add,
		update,
		install: async (name: string) => {
			await installMutation.mutateAsync({ name });
			return await syncAccount(name, "install");
		},
		uninstall: (name: string) => uninstallMutation.mutate({ name }),
		setEnabled: (name: string, enabled: boolean) =>
			setEnabledMutation.mutate({ name, enabled }),
		isBusy:
			installMutation.isPending ||
			updateMutation.isPending ||
			uninstallMutation.isPending ||
			setEnabledMutation.isPending ||
			accountInstall.isPending ||
			accountUninstall.isPending ||
			accountSetEnabled.isPending,
	};
}
