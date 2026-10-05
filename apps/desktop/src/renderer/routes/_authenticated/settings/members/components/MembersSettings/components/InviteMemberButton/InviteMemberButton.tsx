import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { HiOutlinePlus } from "react-icons/hi2";
import { useInviteMember } from "renderer/routes/_authenticated/hooks/useInviteMember";

export function InviteMemberButton() {
	const invite = useInviteMember();

	if (!invite) {
		return null;
	}

	return (
		<Button size="sm" onClick={invite} className="gap-1.5">
			<HiOutlinePlus className="h-3.5 w-3.5" />
			<Trans>Invite member</Trans>
		</Button>
	);
}
