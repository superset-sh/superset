import { msg } from "@lingui/core/macro";
import { Button } from "@superset/ui/button";
import { Pixel404 } from "@superset/ui/pixel-404";
import type { Metadata } from "next";
import Link from "next/link";
import { MessageScreen } from "@/components/MessageScreen";
import { i18n } from "@/lib/i18n-server";

export const metadata: Metadata = {
	title: "Page not found",
	robots: { index: false },
};

export default function NotFound() {
	return (
		<MessageScreen
			graphic={<Pixel404 className="max-w-[260px] text-foreground" />}
			title={i18n._(msg({ message: "Page not found" }))}
			description={i18n._(
				msg({
					message: "The link may be wrong, or whatever was here has moved.",
				}),
			)}
			action={
				<Button asChild size="sm" variant="outline">
					<Link href="/">{i18n._(msg({ message: "Take me home" }))}</Link>
				</Button>
			}
		/>
	);
}
