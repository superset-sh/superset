import { msg } from "@lingui/core/macro";
import { Button } from "@superset/ui/button";
import { Pixel404 } from "@superset/ui/pixel-404";
import Link from "next/link";
import { MessageScreen } from "@/components/MessageScreen";
import { i18n } from "@/lib/i18n-server";

export default function PageNotFound() {
	return (
		<MessageScreen
			graphic={<Pixel404 className="max-w-[260px] text-foreground" />}
			title={i18n._(
				msg({
					message: "This page isn't here",
				}),
			)}
			description={i18n._(
				msg({
					message:
						"The link may be wrong, the page may have been deleted, or you may not have access to it.",
				}),
			)}
			action={
				<Button asChild size="sm" variant="outline">
					<Link href="/">
						{i18n._(
							msg({
								message: "Go to Superset",
							}),
						)}
					</Link>
				</Button>
			}
		/>
	);
}
