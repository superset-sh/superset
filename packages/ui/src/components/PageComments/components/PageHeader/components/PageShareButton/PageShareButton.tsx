"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Share2 } from "lucide-react";
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
			<Button
				variant="ghost"
				size="xs"
				className={
					compact
						? "h-6 gap-1 px-1.5 text-xs text-muted-foreground hover:text-foreground"
						: "gap-1.5"
				}
				aria-label={label}
				title={label}
			>
				<Share2 className="size-3.5" />
				<Trans>Share</Trans>
			</Button>
		</PageSharePopover>
	);
}
