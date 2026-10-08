"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Building2, Globe, Lock } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import {
	keepOpenForToasts,
	ShareAccess,
	type ShareConfirmation,
	type ShareRoleOption,
} from "../../../../../../../ShareAccess";
import { Label } from "../../../../../../../ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "../../../../../../../ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../../../../../../../ui/select";
import { Separator } from "../../../../../../../ui/separator";
import { toast } from "../../../../../../../ui/sonner";
import { useFramePointerDown } from "../../../../../../hooks/useFramePointerDown";
import { relativeTime } from "../../../../../../utils/relativeTime";
import type {
	PageHeaderActions,
	PageHeaderPage,
	PageHeaderVersion,
	PageShareRole,
	PageVisibility,
} from "../../../../types";

const LATEST = "latest";
const WIDTH: Record<PageVisibility, number> = {
	just_me: 0,
	org: 1,
	everyone: 2,
};

interface PageSharePopoverProps {
	page: PageHeaderPage;
	versions: PageHeaderVersion[];
	editable: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSetVisibility: PageHeaderActions["onSetVisibility"];
	onSetSharedVersion: PageHeaderActions["onSetSharedVersion"];
	currentUserId: string | undefined;
	sharing: PageHeaderActions["sharing"];
	children: ReactNode;
}

export function PageSharePopover({
	page,
	versions,
	editable,
	open,
	onOpenChange,
	onSetVisibility,
	onSetSharedVersion,
	currentUserId,
	sharing,
	children,
}: PageSharePopoverProps) {
	const { t } = useLingui();
	const [busy, setBusy] = useState(false);

	useFramePointerDown(useCallback(() => onOpenChange(false), [onOpenChange]));

	const copyLink = () => navigator.clipboard.writeText(page.url);
	const organizationName = sharing.organizationName;

	const roles: ShareRoleOption[] = [
		{
			id: "view",
			label: t({ message: "Can view" }),
			description: t({ message: "Read the page" }),
		},
		{
			id: "comment",
			label: t({ message: "Can comment" }),
			description: t({ message: "Read the page and leave comments" }),
		},
	];

	const confirm = (from: string, to: string): ShareConfirmation | null => {
		if (to === "everyone") {
			return {
				title: t({ message: "Make this page public?" }),
				description: t({
					message: `Anyone with the link can view it, including people outside ${organizationName} and people who aren't signed in.`,
				}),
				actionLabel: t({ message: "Make public" }),
			};
		}
		if (WIDTH[to as PageVisibility] >= WIDTH[from as PageVisibility]) {
			return null;
		}
		return to === "just_me"
			? {
					title: t({ message: "Limit to people invited?" }),
					description: t({
						message: `Anyone in ${organizationName} who isn't listed here loses access.`,
					}),
					actionLabel: t({ message: "Limit access" }),
				}
			: {
					title: t({ message: `Limit to ${organizationName}?` }),
					description: t({
						message: `People outside ${organizationName} lose access, and the public link stops working.`,
					}),
					actionLabel: t({ message: "Limit access" }),
				};
	};

	const run = async (action: () => Promise<void>, failure: string) => {
		setBusy(true);
		try {
			await action();
		} catch (error) {
			toast.error(errorMessage(error, failure));
		} finally {
			setBusy(false);
		}
	};

	const sharedVersion = page.sharedVersion;
	const latestVersion = page.latestVersion;
	const pinnable = versions.filter(
		(entry) => entry.version !== page.latestVersion,
	);
	const owner = page.owner;

	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverTrigger asChild>{children}</PopoverTrigger>
			<PopoverContent
				align="end"
				className="w-[32rem] p-0"
				onInteractOutside={keepOpenForToasts}
			>
				<ShareAccess
					title={<Trans>Share page</Trans>}
					owner={
						owner
							? {
									userId: owner.id,
									name: owner.name,
									email: owner.email,
									image: owner.image,
								}
							: null
					}
					currentUserId={currentUserId ?? null}
					grantees={sharing.grantees}
					canManage={editable}
					roles={roles}
					defaultRole="comment"
					roleNote=""
					directory={sharing.directory}
					organizationName={organizationName}
					inviteNew={sharing.inviteNew}
					onUpgrade={sharing.onUpgrade}
					onCopyLink={copyLink}
					onAdd={sharing.onAdd}
					onRemove={sharing.onRemove}
					onSetRole={(grantee, role) =>
						sharing.onSetRole(grantee, role as PageShareRole)
					}
					onResendInvite={sharing.onResendInvite}
					general={{
						value: page.visibility,
						hint: t({ message: "Who can open this page from its link" }),
						options: [
							{
								value: "just_me",
								label: t({ message: "Only people invited" }),
								icon: <Lock className="size-3.5 text-muted-foreground" />,
							},
							{
								value: "org",
								label: t({ message: "Anyone in your organization" }),
								icon: <Building2 className="size-3.5 text-muted-foreground" />,
							},
							{
								value: "everyone",
								label: t({ message: "Anyone with the link" }),
								icon: <Globe className="size-3.5 text-muted-foreground" />,
							},
						],
						onChange: async (next) => {
							await onSetVisibility(next as PageVisibility);
							if (next !== "just_me") await copyLink().catch(() => {});
						},
						confirm,
						role: {
							value: sharing.orgRole,
							options: roles,
							appliesTo: ["org", "everyone"],
							onChange: (role) => sharing.onSetOrgRole(role as PageShareRole),
						},
					}}
				>
					<Separator />
					<div className="space-y-2 px-3 py-2.5">
						<div className="space-y-0.5">
							<Label className="font-medium text-sm">
								<Trans>Shared version</Trans>
							</Label>
							<p className="text-muted-foreground text-xs">
								{sharedVersion === null ? (
									<Trans>
										Everyone sees new versions as they are published
									</Trans>
								) : (
									<Trans>
										Everyone stays on v{sharedVersion} until you change this
									</Trans>
								)}
							</p>
						</div>
						<Select
							value={sharedVersion === null ? LATEST : String(sharedVersion)}
							disabled={!editable || busy || versions.length === 0}
							onValueChange={(value) =>
								void run(
									() =>
										onSetSharedVersion(value === LATEST ? null : Number(value)),
									t({ message: "Could not change the shared version" }),
								)
							}
						>
							<SelectTrigger size="sm" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={LATEST}>
									{latestVersion === null
										? t({ message: "Latest" })
										: t({ message: `Latest (v${latestVersion})` })}
								</SelectItem>
								{pinnable.map((entry) => {
									const version = entry.version;
									return (
										<SelectItem key={version} value={String(version)}>
											<Trans>Version {version}</Trans> ·{" "}
											{entry.label ?? relativeTime(entry.createdAt)}
										</SelectItem>
									);
								})}
							</SelectContent>
						</Select>
					</div>
				</ShareAccess>
			</PopoverContent>
		</Popover>
	);
}
