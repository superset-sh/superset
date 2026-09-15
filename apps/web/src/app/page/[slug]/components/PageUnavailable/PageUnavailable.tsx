import { msg } from "@lingui/core/macro";
import { Button } from "@superset/ui/button";
import Link from "next/link";
import { initServerI18n } from "@/lib/i18n-server";
import { PageMissingScreen } from "../PageMissingScreen";

interface PageUnavailableProps {
	slug: string;
}

export async function PageUnavailable({ slug }: PageUnavailableProps) {
	const i18n = await initServerI18n();

	return (
		<PageMissingScreen
			action={
				<Button asChild size="sm">
					<Link
						href={{
							pathname: "/sign-in",
							query: { redirect: `/page/${slug}` },
						}}
					>
						{i18n._(msg({ message: "Sign in" }))}
					</Link>
				</Button>
			}
		/>
	);
}
