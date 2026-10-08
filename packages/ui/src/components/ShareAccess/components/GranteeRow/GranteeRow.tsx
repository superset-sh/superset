import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Check, ChevronDown, Mail, Trash2 } from "lucide-react";
import { cn } from "../../../../lib/utils";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../../../ui/dropdown-menu";
import type { ShareGrantee, ShareRoleOption } from "../../types";
import { GranteeAvatar } from "../GranteeAvatar";

interface GranteeRowProps {
	grantee: ShareGrantee;
	roles: ShareRoleOption[];
	canManage: boolean;
	isYou: boolean;
	/** Access the person gets from a team or general access, when it beats their own. */
	effective: { role: string; via: string } | null;
	highlighted: boolean;
	onSetRole: (role: string) => void;
	onRemove: () => void;
	onResendInvite: (() => void) | undefined;
}

export function GranteeRow({
	grantee,
	roles,
	canManage,
	isYou,
	effective,
	highlighted,
	onSetRole,
	onRemove,
	onResendInvite,
}: GranteeRowProps) {
	const { t } = useLingui();
	const roleId = grantee.role ?? roles[0]?.id;
	const role = roles.find((option) => option.id === roleId) ?? roles[0];
	const label = role?.label ?? "";
	const effectiveLabel = effective
		? roles.find((option) => option.id === effective.role)?.label
		: undefined;

	const name = grantee.kind === "invitation" ? grantee.email : grantee.name;
	const detail =
		grantee.kind === "user" ? (
			grantee.email
		) : grantee.kind === "team" ? (
			<Plural value={grantee.memberCount} one="# person" other="# people" />
		) : (
			<Trans>Invite pending</Trans>
		);

	return (
		<div
			className={cn(
				"-mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors duration-1000",
				highlighted && "bg-accent duration-0",
			)}
		>
			{grantee.kind === "user" ? (
				<GranteeAvatar
					kind="person"
					name={grantee.name}
					image={grantee.image}
				/>
			) : (
				<GranteeAvatar kind={grantee.kind === "team" ? "team" : "invite"} />
			)}
			<div className="min-w-0 flex-1">
				<p className="flex items-center gap-1 truncate text-sm">
					<span className="truncate">{name}</span>
					{isYou ? (
						<span className="shrink-0 text-muted-foreground">
							<Trans>(you)</Trans>
						</span>
					) : null}
				</p>
				<p className="truncate text-muted-foreground text-xs">{detail}</p>
			</div>
			{canManage ? (
				<DropdownMenu>
					<DropdownMenuTrigger
						className="flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-1 text-muted-foreground text-xs outline-hidden hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent data-[state=open]:text-foreground"
						aria-label={t({ message: `Access for ${name}` })}
					>
						{label}
						<ChevronDown className="size-3" />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-60">
						{effective && effectiveLabel ? (
							<>
								<DropdownMenuLabel className="font-normal">
									<span className="block text-muted-foreground text-xs">
										<Trans>Current access</Trans>
									</span>
									<span className="block text-sm">{effectiveLabel}</span>
									<span className="block text-muted-foreground text-xs">
										<Trans>via {effective.via}</Trans>
									</span>
								</DropdownMenuLabel>
								<DropdownMenuSeparator />
							</>
						) : null}
						{roles.map((option) => (
							<DropdownMenuItem
								key={option.id}
								onSelect={() => {
									if (option.id !== roleId) onSetRole(option.id);
								}}
								className="items-start"
							>
								<div className="min-w-0 flex-1">
									<p className="text-sm">{option.label}</p>
									<p className="text-muted-foreground text-xs">
										{option.description}
									</p>
								</div>
								{option.id === roleId ? (
									<Check className="mt-0.5 size-3.5 text-foreground" />
								) : null}
							</DropdownMenuItem>
						))}
						<DropdownMenuSeparator />
						{grantee.kind === "invitation" && onResendInvite ? (
							<DropdownMenuItem onSelect={onResendInvite}>
								<Mail className="size-3.5" />
								<Trans>Resend invite</Trans>
							</DropdownMenuItem>
						) : null}
						<DropdownMenuItem variant="destructive" onSelect={onRemove}>
							<Trash2 className="size-3.5" />
							{grantee.kind === "invitation" ? (
								<Trans>Cancel invite</Trans>
							) : (
								<Trans>Remove</Trans>
							)}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			) : (
				<span className="shrink-0 px-1.5 text-muted-foreground text-xs">
					{label}
				</span>
			)}
		</div>
	);
}
