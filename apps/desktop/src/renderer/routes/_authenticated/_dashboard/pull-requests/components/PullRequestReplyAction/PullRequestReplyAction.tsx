import { Trans } from "@lingui/react/macro";

const CLASS_NAME =
	"rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground";

interface PullRequestReplyActionProps {
	/** Replies in the app; absent where no composer can take one. */
	onReply?: (() => void) | null;
	/** The comment on GitHub, for when the app cannot reply. */
	href?: string | null;
}

/** A card's Reply: in the app when a composer can take it, otherwise a link to the comment on GitHub. */
export function PullRequestReplyAction({
	onReply,
	href,
}: PullRequestReplyActionProps) {
	if (onReply) {
		return (
			<button type="button" onClick={onReply} className={CLASS_NAME}>
				<Trans>Reply</Trans>
			</button>
		);
	}
	if (!href) return null;
	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			className={CLASS_NAME}
		>
			<Trans>Reply</Trans>
		</a>
	);
}
