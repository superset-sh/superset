import { Text } from "@react-email/components";
import { PersonalLayout } from "../components";

const body = "text-base leading-[26px] text-foreground";

interface ActivationNudge2Props {
	unsubscribeUrl?: string;
}

export function ActivationNudge2({
	unsubscribeUrl,
}: ActivationNudge2Props = {}) {
	return (
		<PersonalLayout
			preview="One-line reply is plenty."
			unsubscribeUrl={unsubscribeUrl}
		>
			<Text className={`${body} m-0 mb-4`}>
				You signed up for Superset last week but never got a workspace running —
				totally fine, but I’d love to know why. Was it the download? Setup? Not
				wanting an agent near your repo? Just time?
			</Text>
			<Text className={`${body} m-0 mb-4`}>
				One-line reply is plenty. I read every message, and if something’s
				broken I’ll fix it this week.
			</Text>
			<Text className={`${body} m-0`}>— Satya</Text>
		</PersonalLayout>
	);
}

export default ActivationNudge2;
