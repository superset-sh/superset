import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { CgLaptop } from "react-icons/cg";
import { HiCheck, HiChevronUpDown } from "react-icons/hi2";
import { LuGitFork } from "react-icons/lu";
import type { WorkspaceCheckout } from "renderer/stores/new-workspace-draft";
import { FormPickerTrigger } from "../FormPickerTrigger";

interface CheckoutPickerPillProps {
	checkout: WorkspaceCheckout;
	onSelectCheckout: (checkout: WorkspaceCheckout) => void;
	/** A linked PR always gets its own worktree; the pill shows why it is fixed. */
	disabled?: boolean;
}

/**
 * Worktree or Local: where the new workspace's files live. Separate from the
 * device picker on purpose — the host is where work runs, the checkout is
 * whether it gets its own copy of the repo.
 */
export function CheckoutPickerPill({
	checkout,
	onSelectCheckout,
	disabled = false,
}: CheckoutPickerPillProps) {
	const { t } = useLingui();
	const label =
		checkout === "local" ? t({ message: "Local" }) : t({ message: "Worktree" });
	const Icon = checkout === "local" ? CgLaptop : LuGitFork;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={disabled}>
				<FormPickerTrigger
					aria-label={t({ message: `Checkout: ${label}` })}
					title={
						disabled
							? t({ message: "A pull request always gets its own worktree" })
							: label
					}
					disabled={disabled}
				>
					<Icon className="size-3 shrink-0" />
					<span className="truncate">{label}</span>
					<HiChevronUpDown className="size-3 shrink-0" />
				</FormPickerTrigger>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-72">
				<DropdownMenuItem
					onSelect={() => onSelectCheckout("worktree")}
					className="items-start gap-2"
				>
					<LuGitFork className="mt-0.5 size-4 shrink-0" />
					<span className="flex min-w-0 flex-1 flex-col">
						<span>
							<Trans>Worktree</Trans>
						</span>
						<span className="text-xs text-muted-foreground">
							<Trans>Its own branch and copy of the files</Trans>
						</span>
					</span>
					{checkout === "worktree" && (
						<HiCheck className="mt-0.5 size-4 shrink-0" />
					)}
				</DropdownMenuItem>
				<DropdownMenuItem
					onSelect={() => onSelectCheckout("local")}
					className="items-start gap-2"
				>
					<CgLaptop className="mt-0.5 size-4 shrink-0" />
					<span className="flex min-w-0 flex-1 flex-col">
						<span>
							<Trans>Local</Trans>
						</span>
						<span className="text-xs text-muted-foreground">
							<Trans>
								The project's checkout as it is — files and branch are shared
							</Trans>
						</span>
					</span>
					{checkout === "local" && (
						<HiCheck className="mt-0.5 size-4 shrink-0" />
					)}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
