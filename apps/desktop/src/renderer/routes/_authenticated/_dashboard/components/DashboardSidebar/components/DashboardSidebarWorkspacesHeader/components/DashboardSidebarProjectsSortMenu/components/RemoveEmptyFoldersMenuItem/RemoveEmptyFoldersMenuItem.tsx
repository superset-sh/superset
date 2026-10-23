import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { DropdownMenuItem } from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { LuFolderX } from "react-icons/lu";
import {
	type RemoveEmptySidebarFoldersResult,
	type SkippedSidebarFolder,
	useEmptySidebarFolders,
} from "renderer/routes/_authenticated/hooks/useEmptySidebarFolders";

/**
 * Removes stored folders whose tag no workspace carries. Mounted only while
 * the menu is open, so the sidebar does not track the count otherwise. The
 * menu stays open while a purge runs: the purge refetches stale sources and
 * reads their data from this component's later renders.
 */
export function RemoveEmptyFoldersMenuItem() {
	const { t } = useLingui();
	const { emptyFolders, unverifiedFolders, removeEmptyFolders } =
		useEmptySidebarFolders();
	const emptyCount = emptyFolders.length;
	const [isRemoving, setIsRemoving] = useState(false);

	const describeSkipped = (skippedFolders: readonly SkippedSidebarFolder[]) => {
		const skipped = skippedFolders.length;
		if (skipped === 0) return undefined;
		if (skippedFolders.every(({ reason }) => reason === "noLongerEmpty")) {
			return t({
				message: plural(skipped, {
					one: "Skipped # folder: it changed while it was being removed.",
					other:
						"Skipped # folders: they changed while they were being removed.",
				}),
			});
		}
		if (
			skippedFolders.every(({ reason }) => reason === "organizationChanged")
		) {
			return t({
				message: plural(skipped, {
					one: "Skipped # folder: this window switched organization.",
					other: "Skipped # folders: this window switched organization.",
				}),
			});
		}
		if (
			skippedFolders.every(({ reason }) => reason === "settingHostsUnknown")
		) {
			return t({
				message: plural(skipped, {
					one: "Skipped # folder: not every host that keeps its settings is known yet.",
					other:
						"Skipped # folders: not every host that keeps their settings is known yet.",
				}),
			});
		}
		return t({
			message: plural(skipped, {
				one: "Skipped # folder: a host or the cloud has not answered yet.",
				other: "Skipped # folders: a host or the cloud has not answered yet.",
			}),
		});
	};

	const report = ({
		removed,
		skipped,
		failed,
	}: RemoveEmptySidebarFoldersResult) => {
		if (failed.length > 0) {
			toast.error(
				t({
					message: plural(failed.length, {
						one: "Could not remove # folder",
						other: "Could not remove # folders",
					}),
				}),
				{ description: failed[0]?.error },
			);
		}
		if (removed.length > 0) {
			toast.success(
				t({
					message: plural(removed.length, {
						one: "Removed # empty folder",
						other: "Removed # empty folders",
					}),
				}),
				{ description: describeSkipped(skipped) },
			);
			return;
		}
		if (failed.length === 0) {
			toast(t({ message: "No folders removed" }), {
				description: describeSkipped(skipped),
			});
		}
	};

	return (
		<DropdownMenuItem
			disabled={
				isRemoving || (emptyCount === 0 && unverifiedFolders.length === 0)
			}
			onSelect={(event) => {
				event.preventDefault();
				setIsRemoving(true);
				void removeEmptyFolders()
					.then(report, (error: unknown) => {
						console.error("[sidebar] remove empty folders failed:", error);
						toast.error(t({ message: "Could not remove empty folders" }), {
							description: errorMessage(error),
						});
					})
					.finally(() => setIsRemoving(false));
			}}
		>
			<LuFolderX className="size-4" />
			{emptyCount > 0
				? t({
						message: plural(emptyCount, {
							one: "Remove # empty folder",
							other: "Remove # empty folders",
						}),
					})
				: unverifiedFolders.length > 0
					? t({ message: "Remove empty folders" })
					: t({ message: "No empty folders" })}
		</DropdownMenuItem>
	);
}
