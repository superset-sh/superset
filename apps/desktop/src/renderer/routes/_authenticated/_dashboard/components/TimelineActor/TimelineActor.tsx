import { Trans } from "@lingui/react/macro";
import { CloudWorkspacePersonLink } from "renderer/routes/_authenticated/_dashboard/components/CloudWorkspacePersonLink";
export type TimelineActorValue =
	| {
			kind: "user";
			person: { userId: string; name: string; image: string | null };
	  }
	| { kind: "system" };

interface TimelineActorProps {
	actor: TimelineActorValue;
	onOpenPerson: (userId: string) => void;
}

export function TimelineActor({ actor, onOpenPerson }: TimelineActorProps) {
	if (actor.kind === "system") {
		return (
			<span className="font-medium">
				<Trans>Superset</Trans>
			</span>
		);
	}
	return (
		<CloudWorkspacePersonLink
			person={actor.person}
			showAvatar={false}
			className="-mx-1 text-inherit"
			onOpen={onOpenPerson}
		/>
	);
}
