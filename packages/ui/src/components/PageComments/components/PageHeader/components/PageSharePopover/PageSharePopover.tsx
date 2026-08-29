"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Building2, Check, Link2, Lock } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "../../../../../ui/avatar";
import { Button } from "../../../../../ui/button";
import { Label } from "../../../../../ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "../../../../../ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../../../../../ui/select";
import { Separator } from "../../../../../ui/separator";
import { toast } from "../../../../../ui/sonner";
import { useFramePointerDown } from "../../../../hooks/useFramePointerDown";
import { relativeTime } from "../../../../utils/relativeTime";
import type {
	PageHeaderActions,
	PageHeaderPage,
	PageHeaderVersion,
	PageVisibility,
} from "../../types";

const LATEST = "latest";

function initialsOf(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	return parts
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? "")
		.join("");
}

interface PageSharePopoverProps {
	page: PageHeaderPage;
	versions: PageHeaderVersion[];
	editable: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSetVisibility: PageHeaderActions["onSetVisibility"];
	onSetSharedVersion: PageHeaderActions["onSetSharedVersion"];
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
	children,
}: PageSharePopoverProps) {
	const { t } = useLingui();
	const [busy, setBusy] = useState(false);
	const [copied, setCopied] = useState(false);
	const [pending, setPending] = useState<{
		pageId: string;
		value: PageVisibility;
	} | null>(null);
	const pendingValue = pending?.pageId === page.id ? pending.value : null;
	const visibility = pendingValue ?? page.visibility;

	useEffect(() => {
		if (pendingValue !== null && page.visibility === pendingValue) {
			setPending(null);
		}
	}, [page.visibility, pendingValue]);

	useFramePointerDown(useCallback(() => onOpenChange(false), [onOpenChange]));

	const copyLink = async () => {
		try {
			await navigator.clipboard.writeText(page.url);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			toast.error(
				t({
					id: "ui.pageShare.copyFailed",
					message: "Could not copy the link",
				}),
			);
		}
	};

	const changeVisibility = async (next: PageVisibility) => {
		if (next === visibility) return;
		setPending({ pageId: page.id, value: next });
		if (next !== "just_me") void copyLink();
		setBusy(true);
		try {
			await onSetVisibility(next);
		} catch (error) {
			setPending(null);
			toast.error(
				error instanceof Error
					? error.message
					: t({
							id: "ui.pageShare.visibilityFailed",
							message: "Could not change who can see this page",
						}),
			);
		} finally {
			setBusy(false);
		}
	};

	const run = async (action: () => Promise<void>, failure: string) => {
		setBusy(true);
		try {
			await action();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : failure);
		} finally {
			setBusy(false);
		}
	};

	const owner = page.owner;
	const sharedVersion = page.sharedVersion;
	const latestVersion = page.latestVersion;
	const pinnable = versions.filter(
		(entry) => entry.version !== page.latestVersion,
	);

	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverTrigger asChild>{children}</PopoverTrigger>
			<PopoverContent align="end" className="w-80 p-0">
				<div className="flex items-center justify-between gap-2 px-3 py-2.5">
					<span className="font-medium text-sm">
						<Trans id="ui.pageShare.title">Share page</Trans>
					</span>
					<Button size="xs" variant="ghost" onClick={() => void copyLink()}>
						{copied ? (
							<Check className="size-3.5 text-primary" />
						) : (
							<Link2 className="size-3.5" />
						)}
						{copied ? (
							<Trans id="ui.pageShare.copied">Copied</Trans>
						) : (
							<Trans id="ui.pageShare.copyLink">Copy link</Trans>
						)}
					</Button>
				</div>

				<Separator />

				<div className="space-y-2 px-3 py-2.5">
					<Label className="font-medium text-sm">
						<Trans id="ui.pageShare.peopleWithAccess">People with access</Trans>
					</Label>
					{owner ? (
						<div className="flex items-center gap-2">
							<Avatar className="size-6">
								{owner.image ? <AvatarImage src={owner.image} /> : null}
								<AvatarFallback className="text-[10px]">
									{initialsOf(owner.name)}
								</AvatarFallback>
							</Avatar>
							<div className="min-w-0 flex-1">
								<p className="truncate text-sm">{owner.name}</p>
								<p className="truncate text-muted-foreground text-xs">
									{owner.email}
								</p>
							</div>
							<span className="shrink-0 text-muted-foreground text-xs">
								<Trans id="ui.pageShare.owner">Owner</Trans>
							</span>
						</div>
					) : (
						<p className="text-muted-foreground text-xs">
							<Trans id="ui.pageShare.ownerMissing">
								The owner's account no longer exists.
							</Trans>
						</p>
					)}
				</div>

				<Separator />

				<div className="space-y-2 px-3 py-2.5">
					<div className="space-y-0.5">
						<Label className="font-medium text-sm">
							<Trans id="ui.pageShare.generalAccess">General access</Trans>
						</Label>
						<p className="text-muted-foreground text-xs">
							<Trans id="ui.pageShare.generalAccessHint">
								Who can open this page from its link
							</Trans>
						</p>
					</div>
					<Select
						value={visibility}
						disabled={!editable || busy}
						onValueChange={(value) =>
							void changeVisibility(value as PageVisibility)
						}
					>
						<SelectTrigger size="sm" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="just_me">
								<Lock className="size-3.5 text-muted-foreground" />
								<Trans id="ui.pageShare.visibilityJustMe">Only you</Trans>
							</SelectItem>
							<SelectItem value="org">
								<Building2 className="size-3.5 text-muted-foreground" />
								<Trans id="ui.pageShare.visibilityOrg">
									Anyone in your organization
								</Trans>
							</SelectItem>
						</SelectContent>
					</Select>
				</div>

				<Separator />

				<div className="space-y-2 px-3 py-2.5">
					<div className="space-y-0.5">
						<Label className="font-medium text-sm">
							<Trans id="ui.pageShare.sharedVersion">Shared version</Trans>
						</Label>
						<p className="text-muted-foreground text-xs">
							{sharedVersion === null ? (
								<Trans id="ui.pageShare.sharedVersionLatestHint">
									Everyone sees new versions as they are published
								</Trans>
							) : (
								<Trans id="ui.pageShare.sharedVersionPinnedHint">
									Everyone stays on v{sharedVersion} until you change this
								</Trans>
							)}
						</p>
					</div>
					<Select
						value={
							page.sharedVersion === null ? LATEST : String(page.sharedVersion)
						}
						disabled={!editable || busy || versions.length === 0}
						onValueChange={(value) =>
							void run(
								() =>
									onSetSharedVersion(value === LATEST ? null : Number(value)),
								t({
									id: "ui.pageShare.sharedVersionFailed",
									message: "Could not change the shared version",
								}),
							)
						}
					>
						<SelectTrigger size="sm" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={LATEST}>
								{latestVersion === null
									? t({ id: "ui.pageShare.latest", message: "Latest" })
									: t({
											id: "ui.pageShare.latestWithVersion",
											message: `Latest (v${latestVersion})`,
										})}
							</SelectItem>
							{pinnable.map((entry) => {
								const version = entry.version;
								return (
									<SelectItem key={version} value={String(version)}>
										<Trans id="ui.pageShare.versionOption">
											Version {version}
										</Trans>{" "}
										· {entry.label ?? relativeTime(entry.createdAt)}
									</SelectItem>
								);
							})}
						</SelectContent>
					</Select>
				</div>
			</PopoverContent>
		</Popover>
	);
}
