import { Button } from "@superset/ui/button";
import { GlobeIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { TbCopy } from "react-icons/tb";
import type { BrowserLoadError } from "shared/tabs-types";

const ERROR_LABELS: Record<number, string> = {
	[-2]: "Network Changed",
	[-6]: "Connection Refused",
	[-7]: "Connection Timed Out",
	[-21]: "Network Changed",
	[-100]: "Connection Closed",
	[-102]: "Connection Refused",
	[-105]: "Name Not Resolved",
	[-106]: "Internet Disconnected",
	[-109]: "Address Unreachable",
	[-118]: "Connection Timed Out",
	[-137]: "Name Not Resolved",
	[-200]: "Certificate Error",
	[-201]: "Certificate Date Invalid",
	[-202]: "Certificate Authority Invalid",
};

const FRIENDLY_MESSAGES: Record<number, string> = {
	[-2]: "The network connection changed",
	[-6]: "Browser Connection was refused",
	[-7]: "The connection timed out",
	[-21]: "The network connection changed",
	[-100]: "The connection was closed",
	[-102]: "Browser Connection was refused",
	[-105]: "The server could not be found",
	[-106]: "You appear to be offline",
	[-109]: "The address is unreachable",
	[-118]: "The connection timed out",
	[-137]: "The server could not be found",
	[-200]: "The site's certificate is invalid",
	[-201]: "The site's certificate has expired",
	[-202]: "The site's certificate authority is not trusted",
};

interface BrowserErrorOverlayProps {
	error: BrowserLoadError;
	onRetry: () => void;
}

export function BrowserErrorOverlay({
	error,
	onRetry,
}: BrowserErrorOverlayProps) {
	const [showDetails, setShowDetails] = useState(false);
	const label = ERROR_LABELS[error.code] ?? "Page Load Failed";
	const friendlyMessage =
		FRIENDLY_MESSAGES[error.code] ?? "The page could not be loaded";
	const detailsText = `Error Code: ${error.code} URL: ${error.url}`;

	const toggleDetails = useCallback(() => {
		setShowDetails((prev) => !prev);
	}, []);

	const copyDetails = useCallback(() => {
		navigator.clipboard.writeText(detailsText);
	}, [detailsText]);

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
							{showDetails ? "Hide Details" : "Show Details"}
						</button>
					</p>
				</div>
				{showDetails && (
					<div className="flex items-center gap-2 w-full rounded-md border border-muted-foreground/20 px-3 py-2">
						<span className="flex-1 text-sm text-muted-foreground/50 truncate">
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
					Restart Browser
				</Button>
			</div>
		</div>
	);
}
