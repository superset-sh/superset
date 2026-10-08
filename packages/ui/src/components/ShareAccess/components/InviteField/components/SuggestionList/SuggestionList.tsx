import { Plural, Trans } from "@lingui/react/macro";
import type { SuggestionItem } from "@superset/shared/sharing";
import { Lock } from "lucide-react";
import { cn } from "../../../../../../lib/utils";
import { GranteeAvatar } from "../../../GranteeAvatar";

interface SuggestionListProps {
	id: string;
	items: SuggestionItem[];
	activeIndex: number | null;
	organizationName: string;
	inviteError: boolean;
	onPick: (index: number) => void;
}

const rowClass =
	"flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm";

export function SuggestionList({
	id,
	items,
	activeIndex,
	organizationName,
	inviteError,
	onPick,
}: SuggestionListProps) {
	return (
		<div
			id={id}
			role="listbox"
			className="absolute inset-x-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
			// Keeps focus in the input so picking doesn't close the list first.
			onMouseDown={(event) => event.preventDefault()}
		>
			{items.map((item, index) => {
				const active = index === activeIndex;
				const key = `${item.kind}-${index}`;
				switch (item.kind) {
					case "heading":
						return (
							<p
								key={key}
								className="px-2 pt-1.5 pb-0.5 text-muted-foreground text-xs"
							>
								<Trans>Keep typing an email to invite</Trans>
							</p>
						);
					case "empty":
						return (
							<p
								key={key}
								className="px-2 py-1.5 text-muted-foreground text-xs"
							>
								<Trans>No one in {organizationName} matches</Trans>
							</p>
						);
					case "blocked":
						return (
							<div key={key} className={cn(rowClass, "cursor-default")}>
								<span className="grid size-7 shrink-0 place-items-center rounded-full border border-muted-foreground/60 border-dashed text-muted-foreground">
									<Lock className="size-3.5" />
								</span>
								<div className="min-w-0">
									<p>
										<Trans>Invite to {organizationName}</Trans>
									</p>
									<p className="text-muted-foreground text-xs">
										<Trans>
											Only {organizationName} admins can invite new people
										</Trans>
									</p>
								</div>
							</div>
						);
					case "team":
					case "member": {
						const disabled = item.hasAccess;
						return (
							<button
								key={key}
								type="button"
								role="option"
								aria-selected={active}
								disabled={disabled}
								tabIndex={-1}
								onClick={() => onPick(index)}
								className={cn(
									rowClass,
									active && "bg-accent",
									disabled ? "cursor-default opacity-55" : "hover:bg-accent",
								)}
							>
								{item.kind === "team" ? (
									<GranteeAvatar kind="team" />
								) : (
									<GranteeAvatar
										kind="person"
										name={item.person.name}
										image={item.person.image}
									/>
								)}
								<div className="min-w-0 flex-1">
									<p className="truncate">
										{item.kind === "team" ? item.team.name : item.person.name}
									</p>
									<p className="truncate text-muted-foreground text-xs">
										{item.kind === "team" ? (
											<Plural
												value={item.team.memberIds.length}
												one="# person"
												other="# people"
											/>
										) : (
											item.person.email
										)}
									</p>
								</div>
								{disabled ? (
									<span className="shrink-0 text-muted-foreground text-xs">
										<Trans>Has access</Trans>
									</span>
								) : null}
							</button>
						);
					}
					case "invite":
					case "invalid": {
						const label = item.kind === "invite" ? item.email : item.text;
						const disabled = item.kind === "invite" && item.invited;
						return (
							<button
								key={key}
								type="button"
								role="option"
								aria-selected={active}
								disabled={disabled}
								tabIndex={-1}
								onClick={() => onPick(index)}
								className={cn(
									rowClass,
									active && "bg-accent",
									disabled ? "cursor-default opacity-55" : "hover:bg-accent",
								)}
							>
								<GranteeAvatar kind="invite" />
								<div className="min-w-0 flex-1">
									<p className="truncate">
										{item.kind === "invite" && item.completion ? (
											label
										) : (
											<Trans>
												Invite {label} to join {organizationName}
											</Trans>
										)}
									</p>
									{item.kind === "invalid" && inviteError ? (
										<p className="text-destructive text-xs">
											<Trans>Enter a full email address</Trans>
										</p>
									) : null}
								</div>
								{disabled ? (
									<span className="shrink-0 text-muted-foreground text-xs">
										<Trans>Invited</Trans>
									</span>
								) : item.kind === "invite" && item.completion && active ? (
									<kbd className="shrink-0 rounded border px-1 text-[10px] text-muted-foreground">
										<Trans>Tab to fill</Trans>
									</kbd>
								) : null}
							</button>
						);
					}
				}
				return null;
			})}
		</div>
	);
}
