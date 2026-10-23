import { useLingui } from "@lingui/react/macro";
import { Alert } from "react-native";
import { errorCopy } from "@/lib/errors";
import { githubAccessFailure } from "./githubAccess";
import { useGithubConnection } from "./useGithubConnection";

/**
 * What to say when GitHub refused an action. A missing connection gets the
 * way to fix it; anything else keeps GitHub's own wording, the only text that
 * says which rule refused.
 */
export function useGithubRefusalAlert() {
	const { t } = useLingui();
	const { connect } = useGithubConnection();
	return (title: string, error: unknown) => {
		if (githubAccessFailure(error) === "not-connected") {
			Alert.alert(
				t({ message: "Connect GitHub to continue" }),
				t({
					message:
						"Superset acts on GitHub as you. Connect your GitHub account to merge, comment on and update pull requests.",
				}),
				[
					{ text: t({ message: "Not now" }), style: "cancel" },
					{
						text: t({ message: "Connect GitHub" }),
						onPress: () => connect.mutate(),
					},
				],
			);
			return;
		}
		Alert.alert(title, errorCopy(error));
	};
}
