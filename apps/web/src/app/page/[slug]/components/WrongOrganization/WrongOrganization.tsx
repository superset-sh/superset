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
			title={i18n._({
				id: "web.wrongOrganization.title",
				message: "This page is in another organization",
			})}
			description={message}
			action={
				<Button asChild size="sm" variant="outline">
					<Link href="/">
						{i18n._({
							id: "web.wrongOrganization.switch",
							message: "Switch organization",
						})}
					</Link>
				</Button>
			}
		/>
	);
}
