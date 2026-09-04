import { Button } from "@superset/ui/button";
import { useCallback, useState } from "react";
import { HiOutlineArrowLeft } from "react-icons/hi2";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { AddSecretSheet } from "./components/AddSecretSheet";
import { EditSecretDialog } from "./components/EditSecretDialog";
import { EnvironmentVariablesList } from "./components/EnvironmentVariablesList";

interface EnvironmentSecretsProps {
	environmentId: string;
	onBack: () => void;
}

interface EditingSecret {
	id: string;
	key: string;
	value: string;
	sensitive: boolean;
}

export function EnvironmentSecrets({
	environmentId,
	onBack,
}: EnvironmentSecretsProps) {
	const [isAddOpen, setIsAddOpen] = useState(false);
	const [editing, setEditing] = useState<EditingSecret | null>(null);
	const [reloadKey, setReloadKey] = useState(0);
	const { data: environment } = cloudTrpc.environment.get.useQuery({
		id: environmentId,
	});

	const reload = useCallback(() => setReloadKey((key) => key + 1), []);

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8 flex items-center gap-3">
				<Button
					className="h-8 w-8 shrink-0"
					onClick={onBack}
					size="icon"
					variant="ghost"
				>
					<HiOutlineArrowLeft className="h-4 w-4" />
				</Button>
				<div className="min-w-0">
					{/* Always exactly one line of text: an empty heading has no line
					    box at all, so the header grew when the name resolved. A
					    non-breaking space is the same height as the name. */}
					<h2 className="text-xl font-semibold truncate">
						{environment?.name ?? "\u00A0"}
					</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Variables set on every sandbox started from this environment.
					</p>
				</div>
			</div>

			<EnvironmentVariablesList
				environmentId={environmentId}
				onAdd={() => setIsAddOpen(true)}
				refreshToken={reloadKey}
				onEdit={(secret) =>
					setEditing({
						id: secret.id,
						key: secret.key,
						value: secret.value,
						sensitive: secret.sensitive,
					})
				}
			/>

			<AddSecretSheet
				environmentId={environmentId}
				onOpenChange={setIsAddOpen}
				onSaved={reload}
				open={isAddOpen}
			/>

			{editing && (
				<EditSecretDialog
					environmentId={environmentId}
					onOpenChange={(open) => {
						if (!open) setEditing(null);
					}}
					onSaved={reload}
					open={Boolean(editing)}
					secret={editing}
				/>
			)}
		</div>
	);
}
