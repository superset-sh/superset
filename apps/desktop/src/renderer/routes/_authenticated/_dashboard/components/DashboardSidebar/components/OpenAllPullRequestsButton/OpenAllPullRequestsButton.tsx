import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import { LuExternalLink } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface OpenAllPullRequestsButtonProps {
	urls: string[];
}

export function OpenAllPullRequestsButton({
	urls,
}: OpenAllPullRequestsButtonProps) {
	const { t } = useLingui();
	const [isOpening, setIsOpening] = useState(false);
	const openUrl = electronTrpc.external.openUrl.useMutation();

	const handleOpen = async () => {
		setIsOpening(true);
		try {
			const results = await Promise.allSettled(
				urls.map((url) => openUrl.mutateAsync(url)),
			);
			const failure = results.find((result) => result.status === "rejected");
			if (failure?.status === "rejected")
				toast.error(errorMessage(failure.reason));
		} finally {
			setIsOpening(false);
		}
	};

	return (
		<Tooltip delayDuration={700}>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={t({ message: "Open all PRs in browser" })}
					disabled={urls.length === 0 || isOpening}
					onClick={handleOpen}
					className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
				>
					<LuExternalLink className="size-3.5" strokeWidth={1.5} />
				</button>
			</TooltipTrigger>
			<TooltipContent side="right">
				<Trans>Open all PRs in browser</Trans>
			</TooltipContent>
		</Tooltip>
	);
}
