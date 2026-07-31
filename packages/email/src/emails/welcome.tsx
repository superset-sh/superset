import { Text } from "@react-email/components";
import { EmailLayout } from "../components";

interface WelcomeEmailProps {
	userName?: string;
	userEmail?: string;
}

export function WelcomeEmail({ userEmail }: WelcomeEmailProps = {}) {
	return (
		<EmailLayout preview="Welcome to Superset." recipientEmail={userEmail}>
			<Text className="text-base leading-[24px] text-foreground mb-4">
				Welcome to Superset.
			</Text>
			<Text className="text-base leading-[24px] text-foreground m-0">
				Questions? Just reply — a founder reads every message.
			</Text>
		</EmailLayout>
	);
}

export default WelcomeEmail;
