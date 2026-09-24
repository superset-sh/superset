"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Globe, Share2 } from "lucide-react";
import { Button } from "../../../../../ui/button";
import type {
	PageHeaderActions,
	PageHeaderPage,
	PageHeaderVersion,
} from "../../types";
import { PageSharePopover } from "./components/PageSharePopover";
import { usePendingVisibility } from "./hooks/usePendingVisibility";

interface PageShareButtonProps {
	page: PageHeaderPage;
	versions: PageHeaderVersion[];
	editable: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSetVisibility: PageHeaderActions["onSetVisibility"];
	onSetSharedVersion: PageHeaderActions["onSetSharedVersion"];
	compact?: boolean;
}

export function PageShareButton({
	page,
	versions,
	editable,
	open,
	onOpenChange,
	onSetVisibility,
	onSetSharedVersion,
	compact = false,
}: PageShareButtonProps) {
	const { t } = useLingui();
	const { visibility, setVisibility } = usePendingVisibility(
		page.id,
		page.visibility,
		onSetVisibility,
	);
	const isPublic = visibility === "everyone";
	const label = isPublic
		? t({ message: "Share page (public)" })
		: t({ message: "Share page" });
	const icon = isPublic ? (
		<Globe className="size-3.5" />
	) : (
		<Share2 className="size-3.5" />
	);

	return (
		<PageSharePopover
			page={{ ...page, visibility }}
			versions={versions}
			editable={editable}
			open={open}
			onOpenChange={onOpenChange}
			onSetVisibility={setVisibility}
			onSetSharedVersion={onSetSharedVersion}
		>
			{compact ? (
				<Button
					variant="ghost"
					size="icon"
					className="size-6 p-0 text-muted-foreground/60 hover:text-muted-foreground"
					aria-label={label}
					title={label}
				>
					{icon}
				</Button>
			) : (
				<Button
					size="xs"
					variant="ghost"
					className="gap-1.5"
					aria-label={label}
					title={label}
				>
					{icon}
					<Trans>Share</Trans>
				</Button>
			)}
		</PageSharePopover>
	);
}
