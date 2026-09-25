import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { TableCell, TableRow } from "@superset/ui/table";
import { HiOutlineTrash } from "react-icons/hi2";

export interface MemberRowData {
	usersHostsId: string;
	userId: string;
	role: "owner" | "member";
	name: string;
	email: string;
}

interface MemberRowProps {
	member: MemberRowData;
	isOwner: boolean;
	onSetRole: (member: MemberRowData, role: "owner" | "member") => void;
	onRemove: (member: MemberRowData) => void;
}

export function MemberRow({
	member,
	isOwner,
	onSetRole,
	onRemove,
}: MemberRowProps) {
	const { t } = useLingui();
	return (
		<TableRow>
			<TableCell className="font-medium">{member.name}</TableCell>
			<TableCell className="text-muted-foreground">{member.email}</TableCell>
			<TableCell>
				{isOwner ? (
					<Select
						value={member.role}
						onValueChange={(value) =>
							onSetRole(member, value as "owner" | "member")
						}
					>
						<SelectTrigger className="h-8">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="owner">
								<Trans>Owner</Trans>
							</SelectItem>
							<SelectItem value="member">
								<Trans>Member</Trans>
							</SelectItem>
						</SelectContent>
					</Select>
				) : (
					<span className="text-sm capitalize">
						{member.role === "owner" ? (
							<Trans>Owner</Trans>
						) : (
							<Trans>Member</Trans>
						)}
					</span>
				)}
			</TableCell>
			{isOwner && (
				<TableCell>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => onRemove(member)}
						aria-label={t({
							message: `Remove ${member.name}`,
						})}
					>
						<HiOutlineTrash className="h-4 w-4" />
					</Button>
				</TableCell>
			)}
		</TableRow>
	);
}
