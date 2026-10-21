import { Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { BotOffIcon } from "lucide-react";
import { FormPickerTrigger } from "../../../DashboardNewWorkspaceForm/PromptGroup/components/FormPickerTrigger";

export function NoAgentToggle({
	active,
	onChange,
}: {
	active: boolean;
	onChange: (active: boolean) => void;
}) {
	return (
		<FormPickerTrigger
			aria-pressed={active}
			onClick={() => onChange(!active)}
			className={cn("shrink-0", active && "text-foreground")}
		>
			<BotOffIcon className="size-4 shrink-0" />
			<Trans>No agent</Trans>
		</FormPickerTrigger>
	);
}
