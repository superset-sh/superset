import { createFileRoute } from "@tanstack/react-router";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider";
import { UsageView } from "./components/UsageView";

export const Route = createFileRoute("/_authenticated/_dashboard/usage/")({
	component: UsagePage,
});

function UsagePage() {
	const { activeHostUrl } = useLocalHostService();

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			{/* Window-drag leaf standing in for the hidden TopBar. */}
			<div className="drag h-10 shrink-0" />
			<div className="min-h-0 flex-1 overflow-y-auto">
				<UsageView hostUrl={activeHostUrl} />
			</div>
		</div>
	);
}
