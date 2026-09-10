"use client";

import { useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { LuDatabase } from "react-icons/lu";

import { posthogQueryUrl } from "../../utils/posthogQueryUrl";

export function PostHogQueryLink({ query }: { query: string | undefined }) {
	const { t } = useLingui();
	if (!query) return null;
	return (
		<Button
			size="sm"
			variant="ghost"
			className="size-6 p-0"
			asChild
			aria-label={t({ message: "Open in PostHog" })}
			title={t({ message: "Open in PostHog" })}
		>
			<a href={posthogQueryUrl(query)} target="_blank" rel="noreferrer">
				<LuDatabase className="size-3.5" />
			</a>
		</Button>
	);
}
