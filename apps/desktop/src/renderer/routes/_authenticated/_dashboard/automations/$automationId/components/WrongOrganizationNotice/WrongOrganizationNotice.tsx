import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { LuBuilding } from "react-icons/lu";

interface WrongOrganizationNoticeProps {
	/** The server's explanation, which names the organization. */
	description: string;
	/** Absent when the server named an organization but not its id. */
	onSwitch: (() => void) | undefined;
}

/**
 * A shared link opened while a different organization is active. The row
 * exists and the viewer can reach it — they are just looking at the wrong
 * organization — so this offers the switch rather than reading as a 404.
 * Mirrors WrongOrganization in apps/web's page route.
 */
export function WrongOrganizationNotice({
	description,
	onSwitch,
}: WrongOrganizationNoticeProps) {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
			<div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
				<LuBuilding className="size-5" />
			</div>
			<div className="space-y-2">
				<h2 className="font-semibold text-lg tracking-tight">
					<Trans>This automation is in another organization</Trans>
				</h2>
				<p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
					{description}
				</p>
			</div>
			{onSwitch && (
				<Button size="sm" onClick={onSwitch}>
					<Trans>Switch organization</Trans>
				</Button>
			)}
		</div>
	);
}
