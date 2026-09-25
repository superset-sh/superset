import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { getBrowserLogo } from "@superset/ui/icons/browser-icons";
import { Label } from "@superset/ui/label";
import { RadioGroup, RadioGroupItem } from "@superset/ui/radio-group";
import { toast } from "@superset/ui/sonner";
import { useCallback, useEffect, useState } from "react";
import type { IconType } from "react-icons";
import { SiArc } from "react-icons/si";
import { TbWorld } from "react-icons/tb";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import {
	BROWSER_IMPORT_BANNER_ID,
	useBrowserImportBannerDismissalsStore,
} from "renderer/stores/browser-import-banner-dismissals";

interface ImportSource {
	id: string;
	browserKey: string;
	browserName: string;
	profileName: string;
}

/**
 * Fallback glyph for browsers without a bundled full-color logo. Arc has an
 * official monochrome mark (tinted below); everything else gets a globe.
 */
const BROWSER_ICONS: Record<string, IconType> = { arc: SiArc };
const BROWSER_ICON_COLORS: Record<string, string> = { arc: "#F45D7F" };

interface ImportHistoryDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

type LoadState =
	| { status: "loading" }
	| { status: "needs-full-disk-access" }
	| { status: "ready"; sources: ImportSource[] };

const isMac = navigator.platform.toUpperCase().includes("MAC");

export function ImportHistoryDialog({
	open,
	onOpenChange,
}: ImportHistoryDialogProps) {
	const { t } = useLingui();
	const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [importHistory, setImportHistory] = useState(true);
	// Logins (cookies) currently only decryptable on macOS.
	const [importLogins, setImportLogins] = useState(isMac);
	const [isImporting, setIsImporting] = useState(false);
	// This dialog is opened from three places (the pane's banner, its
	// overflow menu, and Settings > Browser) — dismissing the banner here, on
	// an actual successful import, is the one place that covers all of them.
	const dismissImportBanner = useBrowserImportBannerDismissalsStore(
		(s) => s.dismiss,
	);

	const loadSources = useCallback(() => {
		setLoadState({ status: "loading" });
		electronTrpcClient.browserHistory.getImportSources
			.query()
			.then((result) => {
				if (result.needsFullDiskAccess) {
					setLoadState({ status: "needs-full-disk-access" });
					return;
				}
				setLoadState({ status: "ready", sources: result.sources });
				setSelectedId(result.sources[0]?.id ?? null);
			})
			.catch(() => {
				setLoadState({ status: "ready", sources: [] });
			});
	}, []);

	useEffect(() => {
		if (open) loadSources();
	}, [open, loadSources]);

	const handleOpenSettings = () => {
		electronTrpcClient.permissions.requestFullDiskAccess
			.mutate()
			.catch(() => {});
	};

	const handleImport = async () => {
		if (!selectedId) return;
		setIsImporting(true);
		const messages: string[] = [];
		// True only once a mutation both resolves and actually wrote a record —
		// a zero-result run (empty source) or a skipped one (Keychain denied)
		// must not count, or the banner dismisses for good after finding
		// nothing. Kept true if a later branch fails, so a failure in the
		// second mutation doesn't hide that the first already wrote real data.
		let importedSomething = false;
		try {
			if (importHistory) {
				const result =
					await electronTrpcClient.browserHistory.importFromSource.mutate({
						sourceId: selectedId,
					});
				importedSomething ||= result.imported > 0;
				messages.push(
					result.imported === 0
						? t({
								message: "no history",
							})
						: t({
								message: plural(result.imported, {
									one: "# history item",
									other: "# history items",
								}),
							}),
				);
			}

			if (importLogins) {
				const result =
					await electronTrpcClient.browserHistory.importCookiesFromSource.mutate(
						{ sourceId: selectedId },
					);
				if (result.keyUnavailable) {
					// Nothing was actually written — Keychain denied access — so this
					// must not count toward importedSomething below.
					messages.push(
						t({
							message: "logins skipped (Keychain access denied)",
						}),
					);
				} else {
					importedSomething ||= result.imported > 0;
					messages.push(
						result.imported === 0
							? t({
									message: "no logins",
								})
							: t({
									message: plural(result.imported, {
										one: "# login",
										other: "# logins",
									}),
								}),
					);
				}
			}

			const joinedMessages = messages.join(
				t({
					message: " and ",
				}),
			);
			if (importedSomething) {
				toast.success(
					t({
						message: `Imported ${joinedMessages}`,
					}),
				);
				dismissImportBanner(BROWSER_IMPORT_BANNER_ID);
			} else {
				toast.error(
					t({
						message: "Could not import from browser",
					}),
					{ description: joinedMessages || undefined },
				);
			}
			onOpenChange(false);
		} catch (error: unknown) {
			// A failure here means one of the two imports above threw — if the
			// other already succeeded, real data was written, so the banner's
			// job is done even though the dialog is reporting an error and
			// staying open for the user to see the failure/retry.
			if (importedSomething) dismissImportBanner(BROWSER_IMPORT_BANNER_ID);
			toast.error(
				t({
					message: "Could not import from browser",
				}),
				{ description: error instanceof Error ? error.message : undefined },
			);
		} finally {
			setIsImporting(false);
		}
	};

	const canImport =
		loadState.status === "ready" &&
		loadState.sources.length > 0 &&
		!!selectedId &&
		(importHistory || importLogins);

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				// The X button, Escape, and outside-click all funnel through here —
				// block all three while importing, matching the footer buttons
				// (which already disable during import) so a close attempt can't
				// race the in-flight mutations to a "did I actually cancel?" state.
				if (isImporting) return;
				onOpenChange(next);
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						<Trans>Import settings from another browser</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>
							Copy your browsing history and logins from another browser into
							Superset. Your original browser isn't changed.
						</Trans>
					</DialogDescription>
				</DialogHeader>

				{loadState.status === "loading" && (
					<p className="py-4 text-sm text-muted-foreground">
						<Trans>Looking for installed browsers…</Trans>
					</p>
				)}

				{loadState.status === "needs-full-disk-access" && (
					<div className="flex flex-col gap-3 py-2 text-sm">
						<p className="text-muted-foreground">
							<Trans>
								Superset needs Full Disk Access to read another browser's data.
								Grant it in System Settings, then check again.
							</Trans>
						</p>
						<div className="flex gap-2">
							<Button variant="outline" size="sm" onClick={handleOpenSettings}>
								<Trans>Open System Settings</Trans>
							</Button>
							<Button variant="ghost" size="sm" onClick={loadSources}>
								<Trans>Check again</Trans>
							</Button>
						</div>
					</div>
				)}

				{loadState.status === "ready" && loadState.sources.length === 0 && (
					<p className="py-4 text-sm text-muted-foreground">
						<Trans>
							No Chrome, Brave, Arc, or other Chromium browsers were found.
						</Trans>
					</p>
				)}

				{loadState.status === "ready" && loadState.sources.length > 0 && (
					<div className="flex flex-col gap-4 py-1">
						<RadioGroup
							className="max-h-64 gap-2 overflow-y-auto"
							value={selectedId ?? undefined}
							onValueChange={setSelectedId}
						>
							{loadState.sources.map((source) => {
								const logo = getBrowserLogo(source.browserKey);
								const Icon = BROWSER_ICONS[source.browserKey] ?? TbWorld;
								const iconColor = BROWSER_ICON_COLORS[source.browserKey];
								return (
									<div key={source.id} className="flex items-center gap-2">
										<RadioGroupItem value={source.id} id={source.id} />
										<Label
											htmlFor={source.id}
											className="flex items-center gap-2 font-normal"
										>
											{logo ? (
												<img src={logo} alt="" className="size-4 shrink-0" />
											) : (
												<Icon
													className={
														iconColor
															? "size-4 shrink-0"
															: "size-4 shrink-0 text-muted-foreground"
													}
													style={iconColor ? { color: iconColor } : undefined}
												/>
											)}
											<span>
												{source.browserName}
												<span className="text-muted-foreground">
													{" "}
													— {source.profileName}
												</span>
											</span>
										</Label>
									</div>
								);
							})}
						</RadioGroup>

						<div className="flex flex-col gap-2 border-t pt-3">
							<div className="flex items-center gap-2">
								<Checkbox
									id="import-history"
									checked={importHistory}
									onCheckedChange={(v) => setImportHistory(v === true)}
								/>
								<Label htmlFor="import-history" className="font-normal">
									<Trans>Browsing history</Trans>
								</Label>
							</div>
							<div className="flex items-start gap-2">
								<Checkbox
									id="import-logins"
									checked={importLogins}
									disabled={!isMac}
									onCheckedChange={(v) => setImportLogins(v === true)}
								/>
								<div className="flex flex-col gap-0.5">
									<Label htmlFor="import-logins" className="font-normal">
										<Trans>Logins (cookies)</Trans>
									</Label>
									<span className="text-xs text-muted-foreground">
										{isMac ? (
											<Trans>
												Quit the source browser first so its logins are saved to
												disk. You'll be asked to allow Keychain access.
											</Trans>
										) : (
											<Trans>Only available on macOS.</Trans>
										)}
									</span>
								</div>
							</div>
						</div>
					</div>
				)}

				<DialogFooter>
					<Button
						variant="ghost"
						onClick={() => onOpenChange(false)}
						disabled={isImporting}
					>
						<Trans>Cancel</Trans>
					</Button>
					<Button onClick={handleImport} disabled={isImporting || !canImport}>
						{isImporting ? <Trans>Importing…</Trans> : <Trans>Import</Trans>}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
