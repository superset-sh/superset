import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Spinner } from "@superset/ui/spinner";
import { cn } from "@superset/ui/utils";
import { useId } from "react";
import { HiChevronUpDown } from "react-icons/hi2";
import { LuFolderDown } from "react-icons/lu";
import { CloneAccessStatus } from "renderer/routes/_authenticated/components/CloneAccessStatus";
import type { useCloneAccessPlan } from "renderer/routes/_authenticated/hooks/useCloneAccessPlan";
import { FormPickerTrigger } from "../DashboardNewWorkspaceForm/PromptGroup/components/FormPickerTrigger";

interface ClonePlanPillProps {
	hostName: string;
	isRemoteTarget: boolean;
	plan: ReturnType<typeof useCloneAccessPlan>;
	/** Manual fallback: the settings setup modal (import, relocation). */
	onOpenSettings: () => void;
}

const DEFAULT_PARENT_DIR = "~/.superset/projects";

/**
 * Short trigger label when the access check failed: what's wrong, not how to
 * fix it. The device pill next to it already names the host.
 */
function failureLabel(
	reason: NonNullable<
		ReturnType<typeof useCloneAccessPlan>["access"]
	>["reason"],
): string | null {
	switch (reason) {
		case "auth":
			return "GitHub sign-in needed";
		case "not_found":
			return "No access to this repo";
		case "network":
		case "unreachable":
			return "Host unreachable";
		default:
			return null;
	}
}

/**
 * Pill in the composer's picker row for a project that isn't on the chosen
 * host yet: creation subsumes setup, so this says where the clone lands and
 * carries the access check's state in its dot. The popover holds the
 * editable location, the check result (with the fix when there is one), and
 * the manual-setup escape hatch. Takes the base-branch picker's slot: there
 * is no repo on the host to pick a branch from yet.
 */
export function ClonePlanPill({
	hostName,
	isRemoteTarget,
	plan,
	onOpenSettings,
}: ClonePlanPillProps) {
	const pathInputId = useId();
	const access = plan.access;
	const failed = !plan.isCheckingAccess && access !== null && !access.ok;
	const verified = !plan.isCheckingAccess && access?.ok === true;
	const parentDir = plan.parentDir || DEFAULT_PARENT_DIR;
	const failure = failed && access ? failureLabel(access.reason) : null;
	const title = failure ?? `Clone to ${parentDir}`;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<FormPickerTrigger
					className={cn(
						"max-w-[280px]",
						failure && "text-amber-500 hover:text-amber-500",
					)}
					title={title}
				>
					<LuFolderDown className="size-4 shrink-0" />
					{failure ? (
						<span className="truncate">{failure}</span>
					) : (
						<span className="truncate">
							Clone to <span className="font-mono">{parentDir}</span>
						</span>
					)}
					{plan.isCheckingAccess ? (
						<Spinner className="size-3 shrink-0" />
					) : verified ? (
						<span
							role="img"
							aria-label="access verified"
							className="inline-block size-1.5 shrink-0 rounded-full bg-emerald-500"
						/>
					) : null}
					<HiChevronUpDown className="size-3 shrink-0" />
				</FormPickerTrigger>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-80 space-y-2.5 p-3 text-xs"
				// Opening shouldn't land in the path field with its text selected.
				onOpenAutoFocus={(e) => e.preventDefault()}
			>
				<label htmlFor={pathInputId} className="block space-y-1">
					<span className="text-muted-foreground">Clone location</span>
					<Input
						id={pathInputId}
						value={plan.parentDir}
						onChange={(e) => plan.setParentDir(e.target.value)}
						placeholder={DEFAULT_PARENT_DIR}
						spellCheck={false}
						className="h-7 px-2 font-mono text-[11px]"
					/>
				</label>
				<CloneAccessStatus
					variant="inline"
					result={access}
					isChecking={plan.isCheckingAccess}
					hostName={hostName}
					isRemoteTarget={isRemoteTarget}
					onRecheck={plan.recheckAccess}
				/>
				<Button
					type="button"
					variant="link"
					size="sm"
					className="h-auto p-0 text-xs text-muted-foreground"
					onClick={onOpenSettings}
				>
					Set up manually
				</Button>
			</PopoverContent>
		</Popover>
	);
}
