import { Trans, useLingui } from "@lingui/react/macro";
import { COMPANY } from "@superset/shared/constants";
import { Label } from "@superset/ui/label";
import { HiArrowTopRightOnSquare } from "react-icons/hi2";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { RemoteAccessSwitch } from "../RemoteAccessSwitch";

export function ExposeViaRelaySection() {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();

	return (
		<div className="flex items-start justify-between gap-6">
			<div className="space-y-1 flex-1">
				<Label
					htmlFor="expose-host-service-via-relay"
					className="text-sm font-medium"
				>
					<HighlightText
						text={t({
							message: "Allow remote access to this device via relay",
						})}
						query={searchQuery}
					/>
				</Label>
				<p className="text-xs text-muted-foreground">
					<Trans>
						When off, nothing else can reach the files and tools on this device.
						You can still connect out to remote sandboxes from here.{" "}
						<a
							href={`${COMPANY.DOCS_URL}/remote-access`}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 text-primary hover:underline"
						>
							Learn more
							<HiArrowTopRightOnSquare className="h-3 w-3" />
						</a>
					</Trans>
				</p>
			</div>
			<RemoteAccessSwitch id="expose-host-service-via-relay" />
		</div>
	);
}
