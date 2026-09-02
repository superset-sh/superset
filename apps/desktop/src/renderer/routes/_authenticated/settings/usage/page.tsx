import { createFileRoute } from "@tanstack/react-router";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider";
import { UsageView } from "./components/UsageView";
import { useRecordUsageSection } from "./hooks/useRecordUsageSection";

export const Route = createFileRoute("/_authenticated/settings/usage/")({
	component: UsagePage,
});

function UsagePage() {
	const { activeHostUrl } = useLocalHostService();
	useRecordUsageSection("token");

	return <UsageView hostUrl={activeHostUrl} />;
}
