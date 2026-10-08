import { type RefObject, useLayoutEffect, useState } from "react";
import type { PullRequestInfoVariant } from "../../../PullRequestInfo";

const COLUMN_MIN_WIDTH_REM = 52;

export function usePullRequestInfoVariant(
	bodyRef: RefObject<HTMLDivElement | null>,
): PullRequestInfoVariant {
	const [variant, setVariant] = useState<PullRequestInfoVariant>("column");

	useLayoutEffect(() => {
		const body = bodyRef.current;
		if (!body) return;

		const update = () => {
			const rem =
				Number.parseFloat(
					getComputedStyle(document.documentElement).fontSize,
				) || 16;
			setVariant(
				body.clientWidth >= COLUMN_MIN_WIDTH_REM * rem ? "column" : "rows",
			);
		};

		update();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(update);
		observer.observe(body);
		return () => observer.disconnect();
	}, [bodyRef]);

	return variant;
}
