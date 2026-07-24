import type { RouterInputs } from "@superset/trpc";
import { Input } from "@superset/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { LuSearch } from "react-icons/lu";

export type CompanyListInput = RouterInputs["customers"]["listCompanies"];

export interface CompanyFiltersProps {
	search: string;
	onSearchChange: (value: string) => void;
	plan: CompanyListInput["plan"];
	onPlanChange: (value: NonNullable<CompanyListInput["plan"]>) => void;
	health: CompanyListInput["health"];
	onHealthChange: (value: NonNullable<CompanyListInput["health"]>) => void;
	scope: CompanyListInput["scope"];
	onScopeChange: (value: NonNullable<CompanyListInput["scope"]>) => void;
	sort: CompanyListInput["sort"];
	onSortChange: (value: NonNullable<CompanyListInput["sort"]>) => void;
}

export function CompanyFilters({
	search,
	onSearchChange,
	plan,
	onPlanChange,
	health,
	onHealthChange,
	scope,
	onScopeChange,
	sort,
	onSortChange,
}: CompanyFiltersProps) {
	return (
		<div className="flex flex-wrap items-center gap-3">
			<div className="relative">
				<LuSearch className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
				<Input
					value={search}
					onChange={(event) => onSearchChange(event.target.value)}
					placeholder="Search by name, slug, or member email"
					className="w-72 pl-8"
				/>
			</div>

			<Select value={plan} onValueChange={onPlanChange}>
				<SelectTrigger className="w-32">
					<SelectValue placeholder="Plan" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All plans</SelectItem>
					<SelectItem value="paying">Paying</SelectItem>
					<SelectItem value="free">Free</SelectItem>
				</SelectContent>
			</Select>

			<Select value={health} onValueChange={onHealthChange}>
				<SelectTrigger className="w-36">
					<SelectValue placeholder="Health" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All health</SelectItem>
					<SelectItem value="active">Active</SelectItem>
					<SelectItem value="idle">Idle</SelectItem>
					<SelectItem value="cooling">Cooling</SelectItem>
					<SelectItem value="dormant">Dormant</SelectItem>
					<SelectItem value="churnRisk">Churn risk</SelectItem>
				</SelectContent>
			</Select>

			<Select value={sort} onValueChange={onSortChange}>
				<SelectTrigger className="w-40">
					<SelectValue placeholder="Sort" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="lastActive">Last active</SelectItem>
					<SelectItem value="members">Most members</SelectItem>
					<SelectItem value="events30d">Most events (30d)</SelectItem>
					<SelectItem value="created">Newest</SelectItem>
				</SelectContent>
			</Select>

			<Tabs
				value={scope}
				onValueChange={(value) =>
					onScopeChange(value as NonNullable<CompanyListInput["scope"]>)
				}
				className="ml-auto"
			>
				<TabsList>
					<TabsTrigger value="customers">Customers</TabsTrigger>
					<TabsTrigger value="all">All orgs</TabsTrigger>
				</TabsList>
			</Tabs>
		</div>
	);
}
