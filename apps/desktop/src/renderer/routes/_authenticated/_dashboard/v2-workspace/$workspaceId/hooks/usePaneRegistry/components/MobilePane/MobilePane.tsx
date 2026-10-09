import { Trans } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { workspaceTrpc } from "@superset/workspace-client";
import { CloudSimulator } from "./components/CloudSimulator";
import { LocalDevices } from "./components/LocalDevices";
import { PaneMessage } from "./components/PaneMessage";

/** Mobile simulator backed by whichever this host can produce: a hosted
 * simulator on a cloud sandbox, or a local iOS/Android simulator on a real
 * machine. */
export function MobilePane() {
	const statusQuery = workspaceTrpc.mobile.status.useQuery();
	const backend = statusQuery.data?.backend;

	if (backend === "eas") {
		return (
			<div className="size-full bg-background">
				<CloudSimulator />
			</div>
		);
	}

	if (backend === "local-ios" || backend === "local-android") {
		return (
			<div className="size-full bg-background">
				<LocalDevices />
			</div>
		);
	}

	return (
		<div className="size-full bg-background">
			<PaneMessage>
				{statusQuery.isError ? (
					<>
						<Trans>Could not reach a mobile simulator.</Trans>
						<div className="mt-2 text-xs opacity-70">
							{errorMessage(statusQuery.error)}
						</div>
					</>
				) : statusQuery.isPending ? (
					<Trans>Looking for a mobile simulator…</Trans>
				) : (
					<Trans>
						No mobile simulator available here. This needs either an EAS
						simulator on a cloud sandbox or a local iOS/Android toolchain.
					</Trans>
				)}
			</PaneMessage>
		</div>
	);
}
