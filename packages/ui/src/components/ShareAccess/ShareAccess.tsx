"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { effectiveRole } from "@superset/shared/sharing";
import { Check, Link2 } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Separator } from "../ui/separator";
import { toast } from "../ui/sonner";
import { GeneralAccess } from "./components/GeneralAccess";
import { GranteeAvatar } from "./components/GranteeAvatar";
import { GranteeRow } from "./components/GranteeRow";
import { InviteField } from "./components/InviteField";
import type {
	InviteNewMode,
	ShareAddRequest,
	ShareDirectory,
	ShareGeneralAccess,
	ShareGrantee,
	ShareGranteeRef,
	SharePerson,
	ShareRoleOption,
} from "./types";

const COPIED_MS = 1500;
const HIGHLIGHT_MS = 1500;

export interface ShareAccessProps {
	title: ReactNode;
	owner: SharePerson | null;
	currentUserId: string | null;
	grantees: ShareGrantee[];
	canManage: boolean;
	/** Weakest first. With one role there is no role picker. */
	roles: ShareRoleOption[];
	defaultRole: string;
	roleNote: string;
	directory: ShareDirectory;
	organizationName: string;
	inviteNew: InviteNewMode;
	onUpgrade: () => void;
	general: ShareGeneralAccess;
	onAdd: (request: ShareAddRequest) => Promise<void>;
	onRemove: (grantee: ShareGranteeRef) => Promise<void>;
	onSetRole?: (grantee: ShareGranteeRef, role: string) => Promise<void>;
	onResendInvite?: (invitationId: string) => Promise<void>;
	onCopyLink: () => Promise<void>;
	/** Extra sections, after general access. */
	children?: ReactNode;
}

function refOf(grantee: ShareGrantee): ShareGranteeRef {
	switch (grantee.kind) {
		case "user":
			return { kind: "user", userId: grantee.userId };
		case "team":
			return { kind: "team", teamId: grantee.teamId };
		case "invitation":
			return { kind: "invitation", invitationId: grantee.invitationId };
	}
}

function keyOf(grantee: ShareGrantee): string {
	const ref = refOf(grantee);
	return `${ref.kind}:${"userId" in ref ? ref.userId : "teamId" in ref ? ref.teamId : ref.invitationId}`;
}

export function ShareAccess({
	title,
	owner,
	currentUserId,
	grantees,
	canManage,
	roles,
	defaultRole,
	roleNote,
	directory,
	organizationName,
	inviteNew,
	onUpgrade,
	general,
	onAdd,
	onRemove,
	onSetRole,
	onResendInvite,
	onCopyLink,
	children,
}: ShareAccessProps) {
	const { t } = useLingui();
	const [copied, setCopied] = useState(false);
	const highlighted = useNewKeys(grantees.map(keyOf));

	const copyLink = async () => {
		try {
			await onCopyLink();
			setCopied(true);
			setTimeout(() => setCopied(false), COPIED_MS);
		} catch {
			toast.error(t({ message: "Could not copy the link" }));
		}
	};

	const failed = (fallback: string) => (error: unknown) =>
		toast.error(errorMessage(error, fallback));

	const remove = (grantee: ShareGrantee) => {
		const ref = refOf(grantee);
		const name = grantee.kind === "invitation" ? grantee.email : grantee.name;
		onRemove(ref).then(
			() =>
				toast(
					grantee.kind === "invitation"
						? t({ message: `Cancelled the invite for ${name}` })
						: t({ message: `Removed ${name}` }),
					{
						action: {
							label: t({ message: "Undo" }),
							onClick: () =>
								void onAdd({
									grantees: [ref],
									emails: [],
									role: grantee.role ?? defaultRole,
								}).catch(failed(t({ message: "Could not undo" }))),
						},
					},
				),
			failed(t({ message: "Could not remove access" })),
		);
	};

	const generalRole =
		general.role?.appliesTo.includes(general.value) === true
			? {
					role: general.role.value,
					label:
						general.options.find((o) => o.value === general.value)?.label ?? "",
				}
			: null;

	return (
		<div>
			<div className="flex items-center justify-between gap-2 px-3 py-2.5">
				<span className="font-medium text-sm">{title}</span>
				<Button size="xs" variant="ghost" onClick={() => void copyLink()}>
					{copied ? (
						<Check className="size-3.5 text-primary" />
					) : (
						<Link2 className="size-3.5" />
					)}
					{copied ? <Trans>Copied</Trans> : <Trans>Copy link</Trans>}
				</Button>
			</div>
			<Separator />
			{canManage ? (
				<>
					<div className="px-3 py-2.5">
						<InviteField
							directory={directory}
							grantees={grantees}
							ownerId={owner?.userId ?? null}
							organizationName={organizationName}
							inviteNew={inviteNew}
							roles={roles}
							defaultRole={defaultRole}
							roleNote={roleNote}
							onAdd={onAdd}
							onUpgrade={onUpgrade}
						/>
					</div>
					<Separator />
				</>
			) : null}
			<div className="space-y-1.5 px-3 py-2.5">
				<Label className="font-medium text-sm">
					<Trans>People with access</Trans>
				</Label>
				<div className="-mx-3 max-h-60 space-y-1 overflow-y-auto px-3">
					{owner ? (
						<div className="flex items-center gap-2 py-1">
							<GranteeAvatar
								kind="person"
								name={owner.name}
								image={owner.image}
							/>
							<div className="min-w-0 flex-1">
								<p className="flex items-center gap-1 truncate text-sm">
									<span className="truncate">{owner.name}</span>
									{owner.userId === currentUserId ? (
										<span className="shrink-0 text-muted-foreground">
											<Trans>(you)</Trans>
										</span>
									) : null}
								</p>
								<p className="truncate text-muted-foreground text-xs">
									{owner.email}
								</p>
							</div>
							<span className="shrink-0 px-1.5 text-muted-foreground text-xs">
								<Trans>Owner</Trans>
							</span>
						</div>
					) : (
						<p className="py-1 text-muted-foreground text-xs">
							<Trans>The owner's account no longer exists.</Trans>
						</p>
					)}
					{grantees.map((grantee) => (
						<GranteeRow
							key={keyOf(grantee)}
							grantee={grantee}
							roles={roles}
							canManage={canManage}
							isYou={
								grantee.kind === "user" && grantee.userId === currentUserId
							}
							effective={
								roles.length > 1 && grantee.kind === "user"
									? effectiveRole({
											userId: grantee.userId,
											ownRole: grantee.role,
											grantees,
											teams: directory.teams,
											roles,
											general: generalRole,
										})
									: null
							}
							highlighted={highlighted.has(keyOf(grantee))}
							onSetRole={(role) =>
								void onSetRole?.(refOf(grantee), role).catch(
									failed(t({ message: "Could not change access" })),
								)
							}
							onRemove={() => remove(grantee)}
							onResendInvite={
								grantee.kind === "invitation" && onResendInvite
									? () =>
											void onResendInvite(grantee.invitationId).then(
												() =>
													toast(
														t({
															message: `Sent the invite to ${grantee.email} again`,
														}),
													),
												failed(t({ message: "Could not resend the invite" })),
											)
									: undefined
							}
						/>
					))}
				</div>
			</div>
			<Separator />
			<div className="px-3 py-2.5">
				<GeneralAccess general={general} canManage={canManage} />
			</div>
			{children}
		</div>
	);
}

/** Keys that appeared since the last render, for a moment, so new rows stand out. */
function useNewKeys(keys: string[]): Set<string> {
	const seen = useRef<Set<string> | null>(null);
	const [fresh, setFresh] = useState<Set<string>>(new Set());
	const signature = keys.join("|");

	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the joined keys, not the array identity
	useEffect(() => {
		const previous = seen.current;
		seen.current = new Set(keys);
		// An empty list is still loading; its first rows aren't new.
		if (!previous?.size) return;
		const added = keys.filter((key) => !previous.has(key));
		if (!added.length) return;
		setFresh(new Set(added));
		const timer = setTimeout(() => setFresh(new Set()), HIGHLIGHT_MS);
		return () => clearTimeout(timer);
	}, [signature]);

	return fresh;
}

/** For the popover around ShareAccess: pressing Undo on a toast shouldn't close it. */
export function keepOpenForToasts(event: {
	target: EventTarget | null;
	preventDefault: () => void;
}) {
	if (
		event.target instanceof Element &&
		event.target.closest("[data-sonner-toaster]")
	) {
		event.preventDefault();
	}
}
