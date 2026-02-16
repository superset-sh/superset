import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	HiArrowsUpDown,
	HiMagnifyingGlass,
	HiOutlinePlus,
} from "react-icons/hi2";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { SecretRow } from "./components/SecretRow";

interface Secret {
	id: string;
	key: string;
	value: string;
	sensitive: boolean;
	createdAt: Date;
	updatedAt: Date;
	createdBy: { id: string; name: string; image: string | null } | null;
}

type SortOrder = "last-updated" | "name" | "type";

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
	{ value: "last-updated", label: "Last Updated" },
	{ value: "name", label: "Name" },
	{ value: "type", label: "Type" },
];

function sortSecrets(secrets: Secret[], order: SortOrder): Secret[] {
	return [...secrets].sort((a, b) => {
		switch (order) {
			case "last-updated":
				return (
					new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
				);
			case "name":
				return a.key.localeCompare(b.key);
			case "type":
				return Number(b.sensitive) - Number(a.sensitive);
			default:
				return 0;
		}
	});
}

interface EnvironmentVariablesListProps {
	cloudProjectId: string;
	organizationId: string;
	onAdd: () => void;
	onEdit: (secret: Secret) => void;
}

export function EnvironmentVariablesList({
	cloudProjectId,
	organizationId,
	onAdd,
	onEdit,
}: EnvironmentVariablesListProps) {
	const [secrets, setSecrets] = useState<Secret[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [searchQuery, setSearchQuery] = useState("");
	const [sortOrder, setSortOrder] = useState<SortOrder>("last-updated");

	const fetchSecrets = useCallback(async () => {
		try {
			const result = await apiTrpcClient.project.secrets.getDecrypted.query({
				projectId: cloudProjectId,
				organizationId,
			});
			setSecrets(result);
		} catch (err) {
			console.error("[secrets/fetch] Failed to fetch secrets:", err);
		} finally {
			setIsLoading(false);
		}
	}, [cloudProjectId, organizationId]);

	useEffect(() => {
		fetchSecrets();
	}, [fetchSecrets]);

	const filteredAndSorted = useMemo(() => {
		const filtered = searchQuery
			? secrets.filter((s) =>
					s.key.toLowerCase().includes(searchQuery.toLowerCase()),
				)
			: secrets;
		return sortSecrets(filtered, sortOrder);
	}, [secrets, searchQuery, sortOrder]);

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-end">
				<Button size="sm" onClick={onAdd}>
					<HiOutlinePlus className="h-4 w-4 mr-1.5" />
					Add Environment Variable
				</Button>
			</div>

			{secrets.length > 0 && (
				<div className="flex items-center gap-3">
					<div className="relative flex-1">
						<HiMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
						<Input
							placeholder="Search by key name..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="pl-9"
						/>
					</div>
					<Select
						value={sortOrder}
						onValueChange={(v) => setSortOrder(v as SortOrder)}
					>
						<SelectTrigger className="w-[180px] shrink-0">
							<HiArrowsUpDown className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{SORT_OPTIONS.map((opt) => (
								<SelectItem key={opt.value} value={opt.value}>
									{opt.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			)}

			{isLoading ? (
				<div className="text-sm text-muted-foreground py-8 text-center">
					Loading...
				</div>
			) : filteredAndSorted.length === 0 ? (
				<div className="text-sm text-muted-foreground py-8 text-center border rounded-md">
					{secrets.length === 0
						? "No environment variables yet"
						: "No matching variables"}
				</div>
			) : (
				<div className="border rounded-md">
					{filteredAndSorted.map((secret) => (
						<SecretRow
							key={secret.id}
							secret={secret}
							organizationId={organizationId}
							onEdit={() => onEdit(secret)}
							onDeleted={fetchSecrets}
						/>
					))}
				</div>
			)}
		</div>
	);
}
