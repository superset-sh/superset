import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { LuCheck, LuPlug, LuSettings2 } from "react-icons/lu";
import type { ProviderAccount } from "../../../providers/useProviderConnections";
import { CHIP_INVALID } from "../../chipStyles";
import { ChipButton } from "../ChipButton";

export function AccountChip({
	accounts,
	value,
	onChange,
	onManage,
	disabled,
}: {
	accounts: ProviderAccount[];
	value: string | null | undefined;
	onChange: (connectionId: string) => void;
	onManage?: () => void;
	disabled?: boolean;
}) {
	const { t } = useLingui();
	const current = accounts.find((account) => account.id === value);
	const label = value
		? (current?.label ?? t({ message: "Unknown account" }))
		: t({ message: "any account" });
	const broken = Boolean(value) && (!current || current.needsReauth);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={disabled}>
				<span>
					<ChipButton
						label={label}
						className={broken ? CHIP_INVALID : undefined}
						disabled={disabled}
					/>
				</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
				{accounts.map((account) => {
					const name = account.label ?? account.id;
					return account.needsReauth ? (
						<DropdownMenuItem
							key={account.id}
							disabled={!onManage}
							onSelect={() => onManage?.()}
						>
							<LuPlug className="size-3.5 shrink-0 text-current" />
							{t({ message: `Reconnect ${name}` })}
						</DropdownMenuItem>
					) : (
						<DropdownMenuItem
							key={account.id}
							className="relative pr-8"
							onSelect={() => onChange(account.id)}
						>
							{name}
							{account.id === value && (
								<span className="absolute right-2 flex size-3.5 items-center justify-center">
									<LuCheck className="size-4" />
								</span>
							)}
						</DropdownMenuItem>
					);
				})}
				{onManage && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem onSelect={onManage}>
							<LuSettings2 className="size-3.5 shrink-0 text-current" />
							<Trans>Manage accounts…</Trans>
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
