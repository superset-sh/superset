import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { AppWindow, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";

interface CustomAppsSectionProps {
	searchQuery: string;
}

/**
 * Lets the user register apps Superset doesn't ship a built-in entry for, so
 * they show up under "Custom" in every "Open in" menu.
 *
 * Values are written on blur (matching the Git settings fields) rather than
 * per-keystroke, so a half-typed bundle id is never persisted.
 */
export function CustomAppsSection({ searchQuery }: CustomAppsSectionProps) {
	const { t } = useLingui();
	const utils = electronTrpc.useUtils();
	const { data: customApps } = electronTrpc.settings.getCustomApps.useQuery();

	const invalidate = () => {
		utils.settings.getCustomApps.invalidate();
	};
	const onError = (error: { message: string }) => toast.error(error.message);

	const createCustomApp = electronTrpc.settings.createCustomApp.useMutation({
		onSettled: invalidate,
		onError,
	});
	const updateCustomApp = electronTrpc.settings.updateCustomApp.useMutation({
		onSettled: invalidate,
		onError,
	});
	const deleteCustomApp = electronTrpc.settings.deleteCustomApp.useMutation({
		onSettled: invalidate,
		onError,
	});

	const [draft, setDraft] = useState({ label: "", appName: "", bundleId: "" });

	const canAdd =
		draft.label.trim().length > 0 &&
		(draft.appName.trim().length > 0 || draft.bundleId.trim().length > 0);

	const handleAdd = () => {
		if (!canAdd) return;
		createCustomApp.mutate(
			{
				label: draft.label.trim(),
				appName: draft.appName.trim() || undefined,
				bundleId: draft.bundleId.trim() || undefined,
			},
			{
				onSuccess: () => setDraft({ label: "", appName: "", bundleId: "" }),
			},
		);
	};

	const missingIdentifier = t({
		message: "Provide an application name or a bundle id",
	});

	return (
		<div className="space-y-3">
			<div className="space-y-0.5">
				<Label className="text-sm font-medium">
					<HighlightText
						text={t({ message: "Custom apps" })}
						query={searchQuery}
					/>
				</Label>
				<p className="text-xs text-muted-foreground">
					<Trans>
						Apps to show under "Custom" in the Open in menus. On macOS the
						bundle id is preferred because it keeps working when the app bundle
						is renamed (for example "Xcode-26.5.0.app").
					</Trans>
				</p>
			</div>

			{customApps && customApps.length > 0 && (
				<ul className="space-y-2">
					{customApps.map((app) => (
						<li key={app.id} className="flex items-center gap-2">
							<AppWindow className="size-4 shrink-0 text-muted-foreground" />
							<Input
								aria-label={t({ message: "Name" })}
								className="flex-1"
								defaultValue={app.label}
								onBlur={(event) => {
									const label = event.target.value.trim();
									if (!label || label === app.label) {
										event.target.value = app.label;
										return;
									}
									updateCustomApp.mutate({
										id: app.id,
										patch: {
											label,
											appName: app.appName,
											bundleId: app.bundleId,
										},
									});
								}}
							/>
							<Input
								aria-label={t({ message: "Application name" })}
								className="flex-1"
								placeholder={t({ message: "Application name" })}
								defaultValue={app.appName ?? ""}
								onBlur={(event) => {
									const appName = event.target.value.trim() || undefined;
									if (appName === app.appName) return;
									if (!appName && !app.bundleId) {
										event.target.value = app.appName ?? "";
										toast.error(missingIdentifier);
										return;
									}
									updateCustomApp.mutate({
										id: app.id,
										patch: {
											label: app.label,
											appName,
											bundleId: app.bundleId,
										},
									});
								}}
							/>
							<Input
								aria-label={t({ message: "Bundle id" })}
								className="flex-1"
								placeholder="com.example.App"
								defaultValue={app.bundleId ?? ""}
								onBlur={(event) => {
									const bundleId = event.target.value.trim() || undefined;
									if (bundleId === app.bundleId) return;
									if (!bundleId && !app.appName) {
										event.target.value = app.bundleId ?? "";
										toast.error(missingIdentifier);
										return;
									}
									updateCustomApp.mutate({
										id: app.id,
										patch: { label: app.label, appName: app.appName, bundleId },
									});
								}}
							/>
							<Button
								variant="ghost"
								size="icon"
								aria-label={t({ message: `Remove ${app.label}` })}
								onClick={() => deleteCustomApp.mutate({ id: app.id })}
							>
								<Trash2 className="size-4" />
							</Button>
						</li>
					))}
				</ul>
			)}

			<div className="flex items-center gap-2">
				<Input
					aria-label={t({ message: "New custom app name" })}
					className="flex-1"
					placeholder={t({ message: "Name (e.g. Xcode Beta)" })}
					value={draft.label}
					onChange={(event) =>
						setDraft((prev) => ({ ...prev, label: event.target.value }))
					}
				/>
				<Input
					aria-label={t({ message: "New custom app application name" })}
					className="flex-1"
					placeholder={t({ message: "Application name" })}
					value={draft.appName}
					onChange={(event) =>
						setDraft((prev) => ({ ...prev, appName: event.target.value }))
					}
				/>
				<Input
					aria-label={t({ message: "New custom app bundle id" })}
					className="flex-1"
					placeholder="com.example.App"
					value={draft.bundleId}
					onChange={(event) =>
						setDraft((prev) => ({ ...prev, bundleId: event.target.value }))
					}
				/>
				<Button
					variant="outline"
					size="sm"
					disabled={!canAdd || createCustomApp.isPending}
					onClick={handleAdd}
				>
					<Plus className="size-4" />
					<Trans>Add</Trans>
				</Button>
			</div>
		</div>
	);
}
