import { COMPANY } from "@superset/shared/constants";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { useState } from "react";
import { HiArrowTopRightOnSquare } from "react-icons/hi2";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ExposeViaRelayConfirmDialog } from "renderer/routes/_authenticated/components/ExposeViaRelayConfirmDialog";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

export function ExposeViaRelaySection() {
	const searchQuery = useSettingsSearchQuery();
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
			loading: "Restarting host services…",
			success: ({ restartedOrgCount }) =>
				restartedOrgCount > 0
					? `Restarted ${restartedOrgCount} host service${restartedOrgCount === 1 ? "" : "s"}`
					: "Setting saved",
			error: (err: Error) => err.message ?? "Failed to update setting",
		});
	};

	const openConfirm = (next: boolean) => {
		setConfirmTargetEnabled(next);
		setConfirmOpen(true);
	};

	const handleChange = (next: boolean) => {
		if (next) {
			gateFeature(GATED_FEATURES.REMOTE_WORKSPACES, () => openConfirm(true));
		} else {
			openConfirm(false);
		}
	};

	return (
		<>
			<div className="flex items-start justify-between gap-6">
				<div className="space-y-1 flex-1">
					<Label
						htmlFor="expose-host-service-via-relay"
						className="text-sm font-medium"
					>
						<HighlightText
							text="Allow remote workspaces to access this device via relay"
							query={searchQuery}
						/>
					</Label>
					<p className="text-xs text-muted-foreground">
						When off, remote workspaces can't access the files and tools on this
						device. You can still connect out to remote sandboxes from here.{" "}
						<a
							href={`${COMPANY.DOCS_URL}/remote-workspaces`}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 text-primary hover:underline"
						>
							Learn more
							<HiArrowTopRightOnSquare className="h-3 w-3" />
						</a>
					</p>
				</div>
				<Switch
					id="expose-host-service-via-relay"
					checked={exposeEnabled ?? false}
					onCheckedChange={handleChange}
					disabled={isLoading || setExpose.isPending}
				/>
			</div>

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
