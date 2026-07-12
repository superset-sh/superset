"use client";

import type { CustomerHealth } from "@superset/shared/customer-health";
import { getInitials } from "@superset/shared/names";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Badge } from "@superset/ui/badge";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { LuArrowLeft } from "react-icons/lu";

import { HealthBadge } from "../../../../components/HealthBadge";

export interface CompanyHeaderProps {
	org: {
		id: string;
		name: string;
		slug: string;
		logo: string | null;
		createdAt: Date;
		allowedDomains: string[];
	};
	health: CustomerHealth;
	churnRisk: boolean;
	lastActiveAt: Date | null;
	memberCount: number;
}

export function CompanyHeader({
	org,
	health,
	churnRisk,
	lastActiveAt,
	memberCount,
}: CompanyHeaderProps) {
	return (
		<div className="space-y-3">
			<Link
				href="/companies"
				className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
			>
				<LuArrowLeft className="size-3.5" />
				Companies
			</Link>
			<div className="flex items-center gap-4">
				<Avatar className="size-12">
					<AvatarImage src={org.logo ?? undefined} />
					<AvatarFallback>{getInitials(org.name, org.slug)}</AvatarFallback>
				</Avatar>
				<div>
					<div className="flex items-center gap-3">
						<h1 className="text-3xl font-bold tracking-tight">{org.name}</h1>
						<HealthBadge health={health} churnRisk={churnRisk} />
					</div>
					<p className="text-muted-foreground text-sm">
						{org.slug} · {memberCount} member{memberCount === 1 ? "" : "s"} ·
						created {formatDistanceToNow(org.createdAt, { addSuffix: true })} ·
						last active{" "}
						{lastActiveAt
							? formatDistanceToNow(lastActiveAt, { addSuffix: true })
							: "never"}
					</p>
				</div>
			</div>
			{org.allowedDomains.length > 0 && (
				<div className="flex items-center gap-2">
					{org.allowedDomains.map((domain) => (
						<Badge key={domain} variant="outline">
							@{domain}
						</Badge>
					))}
				</div>
			)}
		</div>
	);
}
