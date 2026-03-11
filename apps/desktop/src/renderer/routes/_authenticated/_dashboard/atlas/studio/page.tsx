import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Spinner } from "@superset/ui/spinner";
import { Textarea } from "@superset/ui/textarea";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { FeatureStudioQueue } from "renderer/screens/atlas/components/FeatureStudioQueue";

export const Route = createFileRoute("/_authenticated/_dashboard/atlas/studio/")({
	component: FeatureStudioStudioPage,
});

function FeatureStudioStudioPage() {
	const utils = electronTrpc.useUtils();
	const [title, setTitle] = useState("");
	const [rawPrompt, setRawPrompt] = useState("");

	const { data: queue, isLoading } =
		electronTrpc.atlas.featureStudio.listQueue.useQuery();
	const { data: readyToRegister } =
		electronTrpc.atlas.featureStudio.listReadyToRegister.useQuery();

	const createRequestMutation =
		electronTrpc.atlas.featureStudio.createRequest.useMutation({
			onSuccess: async () => {
				setTitle("");
				setRawPrompt("");
				await utils.atlas.featureStudio.listQueue.invalidate();
			},
		});

	const advanceMutation = electronTrpc.atlas.featureStudio.advance.useMutation({
		onSuccess: async () => {
			await utils.atlas.featureStudio.listQueue.invalidate();
			await utils.atlas.featureStudio.listReadyToRegister.invalidate();
		},
	});

	const handleCreate = () => {
		if (!title.trim() || !rawPrompt.trim()) {
			return;
		}

		createRequestMutation.mutate({
			title: title.trim(),
			rawPrompt: rawPrompt.trim(),
		});
	};

	return (
		<div className="space-y-6 p-6">
			<div>
				<h1 className="text-lg font-semibold">Feature Studio</h1>
				<p className="text-sm text-muted-foreground">
					대화에서 시작한 feature 요청을 상태 기반으로 추적하고 승인합니다.
				</p>
			</div>

			<div className="rounded-xl border border-border bg-background p-4 space-y-3">
				<h2 className="text-sm font-medium">새 Feature Request</h2>
				<Input
					value={title}
					onChange={(event) => setTitle(event.target.value)}
					placeholder="예: Lead capture widget"
				/>
				<Textarea
					value={rawPrompt}
					onChange={(event) => setRawPrompt(event.target.value)}
					placeholder="무엇을 만들지, 어떤 규칙을 따를지, 어떤 결과를 기대하는지 적습니다."
					rows={6}
				/>
				<div className="flex justify-end">
					<Button
						onClick={handleCreate}
						disabled={
							createRequestMutation.isPending ||
							!title.trim() ||
							!rawPrompt.trim()
						}
					>
						요청 생성
					</Button>
				</div>
			</div>

			{isLoading || !queue ? (
				<div className="flex items-center justify-center py-12">
					<Spinner className="size-5" />
				</div>
			) : (
				<FeatureStudioQueue
					queue={queue}
					readyToRegisterCount={readyToRegister?.length ?? 0}
					onAdvance={(featureRequestId) =>
						advanceMutation.mutate({ featureRequestId })
					}
				/>
			)}
		</div>
	);
}
