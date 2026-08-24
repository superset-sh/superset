"use client";

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
	useEffect(() => {
		console.error("[pages] viewer error", error);
	}, [error]);

	return (
		<MessageScreen
			title="This page could not be loaded"
			description="The page exists, but its content could not be fetched. This is usually temporary."
			action={
				<Button size="sm" variant="outline" onClick={reset}>
					Try again
				</Button>
			}
		/>
	);
}
