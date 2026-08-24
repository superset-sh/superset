import { Button } from "@superset/ui/button";
import Link from "next/link";
import { MessageScreen } from "@/components/MessageScreen";

interface WrongOrganizationProps {
	message: string;
}

export function WrongOrganization({ message }: WrongOrganizationProps) {
	return (
		<MessageScreen
			title="This page is in another organization"
			description={message}
			action={
				<Button asChild size="sm" variant="outline">
					<Link href="/">Switch organization</Link>
				</Button>
			}
		/>
	);
}
