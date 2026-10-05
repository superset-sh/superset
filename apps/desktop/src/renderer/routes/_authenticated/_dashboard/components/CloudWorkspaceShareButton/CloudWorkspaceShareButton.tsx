import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { AvatarStack } from "@superset/ui/atoms/AvatarStack";
import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Separator } from "@superset/ui/separator";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { LuBuilding2, LuCheck, LuLink, LuLock } from "react-icons/lu";
import { env } from "renderer/env.renderer";
import type { CloudWorkspaceRow } from "renderer/hooks/useCloudWorkspaces";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";

const COPIED_MS = 1500;

interface CloudWorkspaceShareButtonProps {
	workspaceId: string;
	owner: CloudWorkspaceRow["createdBy"];
	visibility: CloudWorkspaceRow["visibility"];
	canEdit: boolean;
	onSetVisibility: (
		visibility: CloudWorkspaceRow["visibility"],
	) => Promise<unknown>;
}

export function CloudWorkspaceShareButton({
	workspaceId,
	owner,
	visibility,
	canEdit,
	onSetVisibility,
}: CloudWorkspaceShareButtonProps) {
	const { t } = useLingui();
	const [isBusy, setIsBusy] = useState(false);
	const [isCopied, setIsCopied] = useState(false);
	const { copyToClipboard } = useCopyToClipboard();

	const copyLink = async () => {
		try {
			await copyToClipboard(
				`${env.NEXT_PUBLIC_WEB_URL}/workspaces/${workspaceId}`,
			);
			setIsCopied(true);
			setTimeout(() => setIsCopied(false), COPIED_MS);
		} catch {
			toast.error(t({ message: "Could not copy the link" }));
		}
	};

	const changeVisibility = async (next: CloudWorkspaceRow["visibility"]) => {
		if (next === visibility) return;
		setIsBusy(true);
		try {
			await onSetVisibility(next);
			if (next === "org") void copyLink();
		} catch (error) {
			toast.error(
				errorMessage(
					error,
					t({ message: "Could not change who can see this workspace" }),
				),
			);
		} finally {
			setIsBusy(false);
		}
	};

	const icon =
		visibility === "just_me" ? (
			<LuLock className="size-3.5" />
		) : (
			<LuBuilding2 className="size-3.5" />
		);

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button size="xs" variant="ghost" className="gap-1.5">
					{icon}
					<Trans>Share</Trans>
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80 p-0">
				<div className="flex items-center justify-between gap-2 px-3 py-2.5">
					<span className="text-sm font-medium">
						<Trans>Share workspace</Trans>
					</span>
					<Button size="xs" variant="ghost" onClick={() => void copyLink()}>
						{isCopied ? (
							<LuCheck className="size-3.5 text-primary" />
						) : (
							<LuLink className="size-3.5" />
						)}
						{isCopied ? <Trans>Copied</Trans> : <Trans>Copy link</Trans>}
					</Button>
				</div>
				<Separator />
				<div className="space-y-2 px-3 py-2.5">
					<Label className="text-sm font-medium">
						<Trans>People with access</Trans>
					</Label>
					{owner && (
						<div className="flex items-center gap-2">
							<AvatarStack
								people={[
									{ id: owner.userId, name: owner.name, image: owner.image },
								]}
								size={24}
							/>
							<span className="min-w-0 flex-1 truncate text-sm">
								{owner.name}
							</span>
							<span className="shrink-0 text-xs text-muted-foreground">
								<Trans>Owner</Trans>
							</span>
						</div>
					)}
				</div>
				<Separator />
				<div className="space-y-2 px-3 py-2.5">
					<div className="space-y-0.5">
						<Label className="text-sm font-medium">
							<Trans>General access</Trans>
						</Label>
						<p className="text-xs text-muted-foreground">
							{canEdit ? (
								<Trans>Who can open this workspace</Trans>
							) : (
								<Trans>Only the owner can change this</Trans>
							)}
						</p>
					</div>
					<Select
						value={visibility}
						disabled={!canEdit || isBusy}
						onValueChange={(value) =>
							void changeVisibility(value as CloudWorkspaceRow["visibility"])
						}
					>
						<SelectTrigger size="sm" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="just_me">
								<LuLock className="size-3.5 text-muted-foreground" />
								<Trans>Only you</Trans>
							</SelectItem>
							<SelectItem value="org">
								<LuBuilding2 className="size-3.5 text-muted-foreground" />
								<Trans>Anyone in your organization</Trans>
							</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</PopoverContent>
		</Popover>
	);
}
