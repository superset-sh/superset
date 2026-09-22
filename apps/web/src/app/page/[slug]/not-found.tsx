import { msg } from "@lingui/core/macro";
import { Button } from "@superset/ui/button";
import Link from "next/link";
import { initServerI18n } from "@/lib/i18n-server";
import { PageMissingScreen } from "./components/PageMissingScreen";

export default async function PageNotFound() {
	const i18n = await initServerI18n();

	return (
		<PageMissingScreen
			action={
				<Button asChild size="sm" variant="outline">
					<Link href="/">{i18n._(msg({ message: "Go to Superset" }))}</Link>
				</Button>
			}
		/>
	);
}
