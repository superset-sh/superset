import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { useState } from "react";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ExposeViaRelayConfirmDialog } from "renderer/routes/_authenticated/components/ExposeViaRelayConfirmDialog";

interface RemoteAccessSwitchProps {
	id: string;
}

export function RemoteAccessSwitch({ id }: RemoteAccessSwitchProps) {
	const { t } = useLingui();
	const utils = electronTrpc.useUtils();
	const { data: exposeEnabled, isLoading } =
		electronTrpc.settings.getExposeHostServiceViaRelay.useQuery();

	const setExpose =
		electronTrpc.settings.setExposeHostServiceViaRelay.useMutation({
			onMutate: async ({ enabled }) => {
				await utils.settings.getExposeHostServiceViaRelay.cancel();
				const previous = utils.settings.getExposeHostServiceViaRelay.getData();
				utils.settings.getExposeHostServiceViaRelay.setData(undefined, enabled);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getExposeHostServiceViaRelay.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getExposeHostServiceViaRelay.invalidate();
			},
		});

	const [confirmOpen, setConfirmOpen] = useState(false);
	const [confirmTargetEnabled, setConfirmTargetEnabled] = useState(false);
	const { gateFeature } = usePaywall();

	const runToggle = (enabled: boolean) => {
		toast.promise(setExpose.mutateAsync({ enabled }), {
			loading: t({
				message: "Restarting host services…",
			}),
			success: ({ restartedOrgCount }) => {
				if (restartedOrgCount === 0) {
					return t({
						message: "Setting saved",
					});
				}
				return restartedOrgCount === 1
					? t({
							message: "Restarted 1 host service",
						})
					: t({
							message: `Restarted ${restartedOrgCount} host services`,
						});
			},
			error: (err: Error) =>
				err.message ??
				t({
					message: "Failed to update setting",
				}),
		});
	};

	const openConfirm = (next: boolean) => {
		setConfirmTargetEnabled(next);
		setConfirmOpen(true);
	};

	const handleChange = (next: boolean) => {
		if (next) {
			gateFeature(GATED_FEATURES.REMOTE_ACCESS, () => openConfirm(true));
		} else {
			openConfirm(false);
		}
	};

	return (
		<>
			<Switch
				id={id}
				checked={exposeEnabled ?? false}
				onCheckedChange={handleChange}
				disabled={isLoading || setExpose.isPending}
			/>
			<ExposeViaRelayConfirmDialog
				open={confirmOpen}
				targetEnabled={confirmTargetEnabled}
				onOpenChange={setConfirmOpen}
				onConfirm={() => {
					const enabled = confirmTargetEnabled;
					setConfirmOpen(false);
					runToggle(enabled);
				}}
			/>
		</>
	);
}
