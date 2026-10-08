import { useLingui } from "@lingui/react/macro";
import { X } from "lucide-react";
import { cn } from "../../../../../../lib/utils";
import type { StagedPick } from "../../../../types";
import { GranteeAvatar } from "../../../GranteeAvatar";

interface StagedChipProps {
	pick: StagedPick;
	onRemove: () => void;
}

export function StagedChip({ pick, onRemove }: StagedChipProps) {
	const { t } = useLingui();
	const label =
		pick.kind === "user"
			? pick.person.name
			: pick.kind === "team"
				? pick.team.name
				: pick.email;

	return (
		<span
			className={cn(
				"inline-flex max-w-full items-center gap-1 rounded-full border bg-muted py-px pr-0.5 pl-0.5 text-xs",
				pick.kind === "email" && "border-dashed",
			)}
		>
			{pick.kind === "user" ? (
				<GranteeAvatar
					kind="person"
					size="sm"
					name={pick.person.name}
					image={pick.person.image}
				/>
			) : (
				<GranteeAvatar
					kind={pick.kind === "team" ? "team" : "invite"}
					size="sm"
				/>
			)}
			<span className="max-w-36 truncate">{label}</span>
			<button
				type="button"
				onClick={onRemove}
				aria-label={t({ message: `Remove ${label}` })}
				className="grid size-4 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
			>
				<X className="size-3" />
			</button>
		</span>
	);
}
