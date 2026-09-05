"use client";

import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { LuRotateCcw } from "react-icons/lu";

import { useGrowthLayout } from "../../providers/GrowthLayoutProvider";

export function ResetLayoutButton() {
	const { resetLayouts } = useGrowthLayout();
	return (
		<Button size="sm" variant="ghost" onClick={resetLayouts}>
			<LuRotateCcw className="size-3.5" />
			<Trans>Reset layout</Trans>
		</Button>
	);
}
