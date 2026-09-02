import { Trans } from "@lingui/react/macro";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { MemberRow, type MemberRowData } from "./components/MemberRow";

interface MembersTableProps {
	members: MemberRowData[];
	isOwner: boolean;
	onSetRole: (member: MemberRowData, role: "owner" | "member") => void;
	onRemove: (member: MemberRowData) => void;
}

export function MembersTable({
	members,
	isOwner,
	onSetRole,
	onRemove,
}: MembersTableProps) {
	return (
		<div className="rounded-md border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>
							<Trans>Name</Trans>
						</TableHead>
						<TableHead>
							<Trans>Email</Trans>
						</TableHead>
						<TableHead className="w-32">
							<Trans>Role</Trans>
						</TableHead>
						{isOwner && <TableHead className="w-12" />}
					</TableRow>
				</TableHeader>
				<TableBody>
					{members.map((member) => (
						<MemberRow
							key={member.usersHostsId}
							member={member}
							isOwner={isOwner}
							onSetRole={onSetRole}
							onRemove={onRemove}
						/>
					))}
					{members.length === 0 && (
						<TableRow>
							<TableCell
								colSpan={isOwner ? 4 : 3}
								className="text-center text-sm text-muted-foreground py-6"
							>
								<Trans>No members yet.</Trans>
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
		</div>
	);
}
