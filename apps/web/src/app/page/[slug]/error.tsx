"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { useEffect } from "react";
import { MessageScreen } from "@/components/MessageScreen";

export default function PageViewerError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	const { t } = useLingui();

	useEffect(() => {
		console.error("[pages] viewer error", error);
	}, [error]);

	return (
		<MessageScreen
			title={t({
				id: "web.pageError.title",
				message: "This page could not be loaded",
			})}
			description={
				<Trans id="web.pageError.description">
					The page exists, but its content could not be fetched. This is usually
					temporary.
				</Trans>
			}
			action={
				<Button size="sm" variant="outline" onClick={reset}>
					<Trans id="web.pageError.retry">Try again</Trans>
				</Button>
			}
		/>
	);
}
