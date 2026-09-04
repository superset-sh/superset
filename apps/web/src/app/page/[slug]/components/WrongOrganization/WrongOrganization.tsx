import { msg } from "@lingui/core/macro";
import { Button } from "@superset/ui/button";
import Link from "next/link";
import { MessageScreen } from "@/components/MessageScreen";
import { i18n } from "@/lib/i18n-server";

interface WrongOrganizationProps {
	message: string;
}

export function WrongOrganization({ message }: WrongOrganizationProps) {
	return (
		<MessageScreen
			title={i18n._(
				msg({
					message: "This page is in another organization",
				}),
			)}
			description={message}
			action={
				<Button asChild size="sm" variant="outline">
					<Link href="/">
						{i18n._(
							msg({
								message: "Switch organization",
							}),
						)}
					</Link>
				</Button>
			}
		/>
	);
}
