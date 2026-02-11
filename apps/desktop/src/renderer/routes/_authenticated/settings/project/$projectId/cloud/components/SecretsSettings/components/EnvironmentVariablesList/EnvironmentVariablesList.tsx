import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useCallback, useEffect, useState } from "react";
import { HiMagnifyingGlass, HiOutlinePlus } from "react-icons/hi2";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { SecretRow } from "./components/SecretRow";

interface Secret {
	id: string;
	key: string;
	value: string;
	sensitive: boolean;
	createdAt: Date;
	updatedAt: Date;
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

	const filteredSecrets = searchQuery
		? secrets.filter((s) =>
				s.key.toLowerCase().includes(searchQuery.toLowerCase()),
			)
		: secrets;

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-end">
				<Button size="sm" onClick={onAdd}>
					<HiOutlinePlus className="h-4 w-4 mr-1.5" />
					Add Environment Variable
				</Button>
			</div>

			{secrets.length > 0 && (
				<div className="relative">
					<HiMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Search by key name..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="pl-9"
					/>
				</div>
			)}

			{isLoading ? (
				<div className="text-sm text-muted-foreground py-8 text-center">
					Loading...
				</div>
			) : filteredSecrets.length === 0 ? (
				<div className="text-sm text-muted-foreground py-8 text-center border rounded-md">
					{secrets.length === 0
						? "No environment variables yet"
						: "No matching variables"}
				</div>
			) : (
				<div className="border rounded-md">
					{filteredSecrets.map((secret) => (
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
