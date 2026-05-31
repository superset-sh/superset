import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getVisibleItemsForSection } from "../utils/settings-search";
import { BehaviorSettings } from "./components/BehaviorSettings";

export const Route = createFileRoute("/_authenticated/settings/behavior/")({
	component: BehaviorSettingsPage,
});

function BehaviorSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(
		() =>
			getVisibleItemsForSection({
				section: "behavior",
				searchQuery,
				isV2: true,
			}),
		[searchQuery],
	);

	return <BehaviorSettings visibleItems={visibleItems} />;
}
