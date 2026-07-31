import { Link, Text } from "@react-email/components";
import { PersonalLayout } from "../components";

const utm =
	"?utm_source=email&utm_medium=lifecycle&utm_campaign=activation&utm_content=d1-first-workspace";

const body = "text-base leading-[26px] text-foreground";

interface ActivationNudge1Props {
	unsubscribeUrl?: string;
}

export function ActivationNudge1({
	unsubscribeUrl,
}: ActivationNudge1Props = {}) {
	return (
		<PersonalLayout
			preview="The agent never touches your working tree."
			unsubscribeUrl={unsubscribeUrl}
		>
			<Text className={`${body} m-0 mb-4`}>
				The whole setup is three steps: install, open a repo, hand an agent one
				task.
			</Text>
			<Text className={`${body} m-0 mb-4`}>
				The part most people don&apos;t realize: the agent never touches your
				working tree. Each workspace is an isolated copy of your repo on its own
				branch. If the result is garbage, delete the workspace — nothing
				happened.
			</Text>
			<Text className={`${body} m-0 mb-4`}>
				So pick something small you were already going to do — a flaky test, a
				TODO, a rename you&apos;ve been putting off — and let an agent take the
				first swing.
			</Text>
			<Text className={`${body} m-0`}>
				<Link
					href={`https://superset.sh/download${utm}`}
					className="text-foreground font-semibold underline"
				>
					Get the desktop app
				</Link>
			</Text>
		</PersonalLayout>
	);
}

export default ActivationNudge1;
