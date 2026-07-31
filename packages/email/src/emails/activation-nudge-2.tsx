import { Link, Text } from "@react-email/components";
import { PersonalLayout } from "../components";

const utm =
	"?utm_source=email&utm_medium=lifecycle&utm_campaign=activation&utm_content=d3-ideas";

const body = "text-base leading-[26px] text-foreground";

interface ActivationNudge2Props {
	unsubscribeUrl?: string;
}

export function ActivationNudge2({
	unsubscribeUrl,
}: ActivationNudge2Props = {}) {
	return (
		<PersonalLayout
			preview="The hardest part is the first prompt."
			unsubscribeUrl={unsubscribeUrl}
		>
			<Text className={`${body} m-0 mb-4`}>
				The hardest part of agent tools is the first prompt. Here&apos;s what
				real usage looks like:
			</Text>
			<Text className={`${body} m-0 mb-4`}>
				<strong>The bug you keep re-opening</strong> — paste the issue, let the
				agent reproduce and fix it.
			</Text>
			<Text className={`${body} m-0 mb-4`}>
				<strong>Tests for that one module</strong> — the coverage you keep
				meaning to write.
			</Text>
			<Text className={`${body} m-0 mb-4`}>
				<strong>Two agents at once</strong> — Claude Code refactors while Codex
				writes the tests, in separate workspaces that can&apos;t collide.
			</Text>
			<Text className={`${body} m-0 mb-4`}>
				You stay the reviewer — everything comes back as a diff.
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

export default ActivationNudge2;
