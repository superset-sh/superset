import { COMPANY } from "@superset/shared/constants";
import { renderSVG } from "uqr";
import { cn } from "../../lib/utils";

const QR_SVG = renderSVG(COMPANY.APP_STORE_URL, {
	border: 4,
	whiteColor: "#ffffff",
	blackColor: "#0b0b0b",
});

interface AppStoreQrProps {
	className?: string;
	label?: string;
}

export function AppStoreQr({ className, label }: AppStoreQrProps) {
	return (
		<div
			role="img"
			aria-label={label}
			aria-hidden={label ? undefined : true}
			className={cn("shrink-0 bg-white [&>svg]:size-full", className)}
			// biome-ignore lint/security/noDangerouslySetInnerHtml: SVG generated at module load from a constant URL
			dangerouslySetInnerHTML={{ __html: QR_SVG }}
		/>
	);
}
