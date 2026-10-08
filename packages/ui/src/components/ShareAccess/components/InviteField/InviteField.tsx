import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	inviteSuggestions,
	isEmail,
	pickableIndexes,
	type SuggestionItem,
	stagedKey,
} from "@superset/shared/sharing";
import {
	type ClipboardEvent,
	type KeyboardEvent,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { Button } from "../../../ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../../../ui/select";
import { toast } from "../../../ui/sonner";
import type {
	InviteNewMode,
	ShareAddRequest,
	ShareDirectory,
	ShareGrantee,
	ShareGranteeRef,
	ShareRoleOption,
	StagedPick,
} from "../../types";
import { StagedChip } from "./components/StagedChip";
import { SuggestionList } from "./components/SuggestionList";

interface InviteFieldProps {
	directory: ShareDirectory;
	grantees: ShareGrantee[];
	ownerId: string | null;
	organizationName: string;
	inviteNew: InviteNewMode;
	roles: ShareRoleOption[];
	defaultRole: string;
	/** Shown instead of a role picker when there is only one role. */
	roleNote: string;
	onAdd: (request: ShareAddRequest) => Promise<void>;
	onUpgrade: () => void;
}

export function InviteField({
	directory,
	grantees,
	ownerId,
	organizationName,
	inviteNew,
	roles,
	defaultRole,
	roleNote,
	onAdd,
	onUpgrade,
}: InviteFieldProps) {
	const { t } = useLingui();
	const listId = useId();
	const inputRef = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState("");
	const [staged, setStaged] = useState<StagedPick[]>([]);
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(0);
	const [inviteError, setInviteError] = useState(false);
	const [role, setRole] = useState(defaultRole);
	const [busy, setBusy] = useState(false);

	const items = useMemo(
		() =>
			open
				? inviteSuggestions({
						query,
						directory,
						grantees,
						staged,
						ownerId,
						inviteNew,
					})
				: [],
		[open, query, directory, grantees, staged, ownerId, inviteNew],
	);
	const pickable = pickableIndexes(items);
	const activeIndex = pickable[active] ?? null;

	const resetQuery = () => {
		setQuery("");
		setActive(0);
		setInviteError(false);
	};

	const stage = (pick: StagedPick) => {
		setStaged((current) =>
			current.some((p) => stagedKey(p) === stagedKey(pick))
				? current
				: [...current, pick],
		);
		resetQuery();
		setOpen(false);
		inputRef.current?.focus();
	};

	const pick = (item: SuggestionItem | undefined) => {
		if (!item) return;
		switch (item.kind) {
			case "team":
				stage({ kind: "team", team: item.team });
				return;
			case "member":
				stage({ kind: "user", person: item.person });
				return;
			case "invite":
				if (inviteNew === "upgrade") {
					setOpen(false);
					onUpgrade();
					return;
				}
				stage({ kind: "email", email: item.email });
				return;
			case "invalid":
				setInviteError(true);
				return;
		}
	};

	const fill = (email: string) => {
		setQuery(email);
		setActive(0);
		setInviteError(false);
		setOpen(true);
		inputRef.current?.focus();
	};

	const submit = async () => {
		if (!staged.length || busy) return;
		setBusy(true);
		try {
			await onAdd({
				grantees: staged.flatMap((p): ShareGranteeRef[] =>
					p.kind === "user"
						? [{ kind: "user", userId: p.person.userId }]
						: p.kind === "team"
							? [{ kind: "team", teamId: p.team.teamId }]
							: [],
				),
				emails: staged.flatMap((p) => (p.kind === "email" ? [p.email] : [])),
				role,
			});
			setStaged([]);
			inputRef.current?.focus();
		} catch (error) {
			toast.error(errorMessage(error, t({ message: "Could not share" })));
		} finally {
			setBusy(false);
		}
	};

	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "ArrowDown" && pickable.length) {
			event.preventDefault();
			setActive((current) => (current + 1) % pickable.length);
		} else if (event.key === "ArrowUp" && pickable.length) {
			event.preventDefault();
			setActive((current) => (current - 1 + pickable.length) % pickable.length);
		} else if (event.key === "Enter") {
			event.preventDefault();
			if (activeIndex !== null) pick(items[activeIndex]);
			else if (!query.trim()) void submit();
		} else if (event.key === "Tab" && activeIndex !== null) {
			const item = items[activeIndex];
			if (item?.kind === "invite" && item.completion) {
				event.preventDefault();
				fill(item.email);
			}
		} else if (event.key === "Escape" && open && items.length) {
			event.preventDefault();
			event.stopPropagation();
			setOpen(false);
		} else if (event.key === "Backspace" && !query && staged.length) {
			setStaged((current) => current.slice(0, -1));
		}
	};

	const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
		const text = event.clipboardData.getData("text");
		if (!text.includes("@") || !/[\s,;]/.test(text.trim())) return;
		event.preventDefault();
		const memberByEmail = new Map(
			directory.members.map((m) => [m.email.toLowerCase(), m]),
		);
		let blocked = 0;
		for (const raw of text.split(/[\s,;]+/)) {
			const email = raw.trim().toLowerCase();
			if (!isEmail(email)) continue;
			const person = memberByEmail.get(email);
			if (person) {
				if (person.userId !== ownerId) stage({ kind: "user", person });
			} else if (inviteNew === "allowed") {
				stage({ kind: "email", email });
			} else {
				blocked += 1;
			}
		}
		if (blocked && inviteNew === "upgrade") onUpgrade();
		else if (blocked) {
			toast.message(
				t({
					message: `Skipped ${blocked} not in ${organizationName}. Only admins can invite new people.`,
				}),
			);
		}
	};

	const newPeople = staged.some((p) => p.kind === "email");

	return (
		<div className="space-y-2">
			<div className="relative">
				{/* biome-ignore lint/a11y/noStaticElementInteractions: clicking the field's padding focuses its input */}
				<div
					className="flex min-h-8 cursor-text flex-wrap items-center gap-1 rounded-md border bg-transparent px-1.5 py-1 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50"
					onMouseDown={(event) => {
						if (event.target === event.currentTarget) {
							event.preventDefault();
							inputRef.current?.focus();
						}
					}}
				>
					{staged.map((p) => (
						<StagedChip
							key={stagedKey(p)}
							pick={p}
							onRemove={() =>
								setStaged((current) =>
									current.filter((s) => stagedKey(s) !== stagedKey(p)),
								)
							}
						/>
					))}
					<input
						ref={inputRef}
						value={query}
						onChange={(event) => {
							setQuery(event.target.value);
							setActive(0);
							setInviteError(false);
							setOpen(true);
						}}
						onFocus={() => setOpen(true)}
						onBlur={() => setOpen(false)}
						onKeyDown={onKeyDown}
						onPaste={onPaste}
						placeholder={
							staged.length
								? t({ message: "Add more…" })
								: t({ message: "Add people or teams by name or email" })
						}
						aria-label={t({ message: "Add people" })}
						role="combobox"
						aria-expanded={items.length > 0}
						aria-controls={listId}
						autoComplete="off"
						spellCheck={false}
						className="min-w-24 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted-foreground"
					/>
				</div>
				{items.length ? (
					<SuggestionList
						id={listId}
						items={items}
						activeIndex={activeIndex}
						organizationName={organizationName}
						inviteError={inviteError}
						onPick={(index) => pick(items[index])}
					/>
				) : null}
			</div>
			{staged.length ? (
				<div className="flex items-center gap-2">
					{roles.length > 1 ? (
						<Select value={role} onValueChange={setRole}>
							<SelectTrigger
								size="sm"
								className="w-auto"
								aria-label={t({ message: "Access for the people you add" })}
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{roles.map((option) => (
									<SelectItem key={option.id} value={option.id}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					) : (
						<span className="text-muted-foreground text-xs">{roleNote}</span>
					)}
					<span className="flex-1" />
					<Button size="sm" disabled={busy} onClick={() => void submit()}>
						{newPeople ? <Trans>Invite</Trans> : <Trans>Share</Trans>}
					</Button>
				</div>
			) : null}
		</div>
	);
}
