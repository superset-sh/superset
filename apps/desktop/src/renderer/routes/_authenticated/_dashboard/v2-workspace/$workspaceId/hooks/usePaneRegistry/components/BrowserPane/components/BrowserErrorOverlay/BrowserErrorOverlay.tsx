import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { Button } from "@superset/ui/button";
import { GlobeIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { TbCopy } from "react-icons/tb";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import type { BrowserLoadError } from "shared/tabs-types";

const ERROR_LABELS: Record<number, MessageDescriptor> = {
	[-2]: msg({
		id: "workspace.browserPane.errorNetworkChanged",
		message: "Network Changed",
	}),
	[-6]: msg({
		id: "workspace.browserPane.errorConnectionRefused",
		message: "Connection Refused",
	}),
	[-7]: msg({
		id: "workspace.browserPane.errorConnectionTimedOut",
		message: "Connection Timed Out",
	}),
	[-21]: msg({
		id: "workspace.browserPane.errorNetworkChangedIp",
		message: "Network Changed",
	}),
	[-100]: msg({
		id: "workspace.browserPane.errorConnectionClosed",
		message: "Connection Closed",
	}),
	[-102]: msg({
		id: "workspace.browserPane.errorConnectionRefusedRemote",
		message: "Connection Refused",
	}),
	[-105]: msg({
		id: "workspace.browserPane.errorNameNotResolved",
		message: "Name Not Resolved",
	}),
	[-106]: msg({
		id: "workspace.browserPane.errorInternetDisconnected",
		message: "Internet Disconnected",
	}),
	[-109]: msg({
		id: "workspace.browserPane.errorAddressUnreachable",
		message: "Address Unreachable",
	}),
	[-118]: msg({
		id: "workspace.browserPane.errorConnectionTimedOutSlow",
		message: "Connection Timed Out",
	}),
	[-137]: msg({
		id: "workspace.browserPane.errorNameNotResolvedDns",
		message: "Name Not Resolved",
	}),
	[-200]: msg({
		id: "workspace.browserPane.errorCertificate",
		message: "Certificate Error",
	}),
	[-201]: msg({
		id: "workspace.browserPane.errorCertificateDateInvalid",
		message: "Certificate Date Invalid",
	}),
	[-202]: msg({
		id: "workspace.browserPane.errorCertificateAuthorityInvalid",
		message: "Certificate Authority Invalid",
	}),
};

const FRIENDLY_MESSAGES: Record<number, MessageDescriptor> = {
	[-2]: msg({
		id: "workspace.browserPane.friendlyNetworkChanged",
		message: "The network connection changed",
	}),
	[-6]: msg({
		id: "workspace.browserPane.friendlyConnectionRefused",
		message: "Browser Connection was refused",
	}),
	[-7]: msg({
		id: "workspace.browserPane.friendlyConnectionTimedOut",
		message: "The connection timed out",
	}),
	[-21]: msg({
		id: "workspace.browserPane.friendlyNetworkChangedIp",
		message: "The network connection changed",
	}),
	[-100]: msg({
		id: "workspace.browserPane.friendlyConnectionClosed",
		message: "The connection was closed",
	}),
	[-102]: msg({
		id: "workspace.browserPane.friendlyConnectionRefusedRemote",
		message: "Browser Connection was refused",
	}),
	[-105]: msg({
		id: "workspace.browserPane.friendlyNameNotResolved",
		message: "The server could not be found",
	}),
	[-106]: msg({
		id: "workspace.browserPane.friendlyInternetDisconnected",
		message: "You appear to be offline",
	}),
	[-109]: msg({
		id: "workspace.browserPane.friendlyAddressUnreachable",
		message: "The address is unreachable",
	}),
	[-118]: msg({
		id: "workspace.browserPane.friendlyConnectionTimedOutSlow",
		message: "The connection timed out",
	}),
	[-137]: msg({
		id: "workspace.browserPane.friendlyNameNotResolvedDns",
		message: "The server could not be found",
	}),
	[-200]: msg({
		id: "workspace.browserPane.friendlyCertificate",
		message: "The site's certificate is invalid",
	}),
	[-201]: msg({
		id: "workspace.browserPane.friendlyCertificateExpired",
		message: "The site's certificate has expired",
	}),
	[-202]: msg({
		id: "workspace.browserPane.friendlyCertificateAuthorityInvalid",
		message: "The site's certificate authority is not trusted",
	}),
};

const FALLBACK_LABEL = msg({
	id: "workspace.browserPane.errorPageLoadFailed",
	message: "Page Load Failed",
});

const FALLBACK_FRIENDLY_MESSAGE = msg({
	id: "workspace.browserPane.friendlyPageLoadFailed",
	message: "The page could not be loaded",
});

interface BrowserErrorOverlayProps {
	error: BrowserLoadError;
	onRetry: () => void;
}

export function BrowserErrorOverlay({
	error,
	onRetry,
}: BrowserErrorOverlayProps) {
	const [showDetails, setShowDetails] = useState(false);
	const label = i18n._(ERROR_LABELS[error.code] ?? FALLBACK_LABEL);
	const friendlyMessage = i18n._(
		FRIENDLY_MESSAGES[error.code] ?? FALLBACK_FRIENDLY_MESSAGE,
	);
	const detailsText = `Error Code: ${error.code} URL: ${error.url}`;

	const toggleDetails = useCallback(() => {
		setShowDetails((prev) => !prev);
	}, []);

	const { copyToClipboard } = useCopyToClipboard();
	const copyDetails = useCallback(() => {
		copyToClipboard(detailsText);
	}, [detailsText, copyToClipboard]);

	return (
		<div className="absolute inset-0 flex items-center justify-center bg-background z-10">
			<div className="flex flex-col items-start gap-4 w-80">
				<GlobeIcon className="size-10 text-muted-foreground/30" />
				<div>
					<h2 className="text-xl font-medium text-muted-foreground/70">
						{label}
					</h2>
					<p className="mt-1.5 text-sm text-muted-foreground/50">
						{friendlyMessage}
					</p>
					<p className="mt-0.5 text-sm text-muted-foreground/50">
						{error.description}
						{" · "}
						<button
							type="button"
							onClick={toggleDetails}
							className="hover:text-muted-foreground/70 transition-colors"
						>
							{showDetails ? (
								<Trans id="workspace.browserPane.hideErrorDetails">
									Hide Details
								</Trans>
							) : (
								<Trans id="workspace.browserPane.showErrorDetails">
									Show Details
								</Trans>
							)}
						</button>
					</p>
				</div>
				{showDetails && (
					<div className="flex items-center gap-2 w-full rounded-md border border-muted-foreground/20 px-3 py-2">
						<span className="flex-1 text-sm text-muted-foreground/50 truncate select-text cursor-text">
							{detailsText}
						</span>
						<button
							type="button"
							onClick={copyDetails}
							className="shrink-0 text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
						>
							<TbCopy className="size-4" />
						</button>
					</div>
				)}
				<Button variant="outline" size="sm" onClick={onRetry}>
					<Trans id="workspace.browserPane.restartBrowser">
						Restart Browser
					</Trans>
				</Button>
			</div>
		</div>
	);
}
