import { msg } from "@lingui/core/macro";
import { Pixel404 } from "@superset/ui/pixel-404";
import type { ReactNode } from "react";
import { MessageScreen } from "@/components/MessageScreen";
import { initServerI18n } from "@/lib/i18n-server";

interface PageMissingScreenProps {
	action: ReactNode;
}

export async function PageMissingScreen({ action }: PageMissingScreenProps) {
	const i18n = await initServerI18n();

	return (
		<MessageScreen
			graphic={<Pixel404 className="max-w-[260px] text-foreground" />}
			title={i18n._(msg({ message: "This page isn't here" }))}
			description={i18n._(
				msg({
					message:
						"The link may be wrong, the page may have been deleted, or you may not have access to it.",
				}),
			)}
			action={action}
		/>
	);
}
