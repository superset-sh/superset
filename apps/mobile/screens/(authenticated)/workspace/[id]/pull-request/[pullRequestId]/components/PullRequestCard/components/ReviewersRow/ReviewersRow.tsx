import type { PullRequestReviewer } from "../../../../../../utils/pullRequest";
import { CardRow } from "../CardRow";
import { ReviewerAvatarStack } from "./components/ReviewerAvatarStack";

const ORDER: Record<PullRequestReviewer["state"], number> = {
	CHANGES_REQUESTED: 0,
	APPROVED: 1,
	COMMENTED: 2,
	REQUESTED: 3,
	DISMISSED: 4,
};

/**
 * One row for everyone. The label names whoever last acted — a comment counts,
 * and a bot nobody assigned counts too — and the sub-label counts whoever was
 * asked and has stayed silent, which is who the faded faces are.
 */
export function ReviewersRow({
	reviewers,
	onPress,
}: {
	reviewers: PullRequestReviewer[];
	onPress?: () => void;
}) {
	if (reviewers.length === 0) {
		return <CardRow label="No Reviewers Assigned" muted onPress={onPress} />;
	}

	const sorted = [...reviewers].sort((a, b) => ORDER[a.state] - ORDER[b.state]);
	const actor = sorted.find((reviewer) => reviewer.state !== "REQUESTED");
	const waiting = sorted.filter(
		(reviewer) => reviewer.state === "REQUESTED",
	).length;

	const label = actor
		? `${actor.login} ${
				actor.state === "CHANGES_REQUESTED"
					? "Requested Changes"
					: actor.state === "APPROVED"
						? "Approved"
						: actor.state === "DISMISSED"
							? "Review Dismissed"
							: "Commented"
			}`
		: "Waiting for Review";

	return (
		<CardRow
			label={label}
			leading={<ReviewerAvatarStack reviewers={sorted} />}
			muted={!actor}
			onPress={onPress}
			subLabel={waiting > 0 && actor ? `${waiting} Waiting` : null}
		/>
	);
}
