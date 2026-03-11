import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { FeatureStudioRequestDetail } from "renderer/screens/atlas/components/FeatureStudioRequestDetail";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/atlas/studio/$requestId/",
)({
	component: FeatureStudioRequestDetailPage,
});

function FeatureStudioRequestDetailPage() {
	const { requestId } = Route.useParams();
	const utils = electronTrpc.useUtils();
	const { data: request, isLoading } =
		electronTrpc.atlas.featureStudio.getRequest.useQuery({
			id: requestId,
		});

	const invalidate = async () => {
		await utils.atlas.featureStudio.getRequest.invalidate({ id: requestId });
		await utils.atlas.featureStudio.listQueue.invalidate();
		await utils.atlas.featureStudio.listReadyToRegister.invalidate();
	};

	const advanceMutation = electronTrpc.atlas.featureStudio.advance.useMutation({
		onSuccess: invalidate,
	});
	const respondToApprovalMutation =
		electronTrpc.atlas.featureStudio.respondToApproval.useMutation({
			onSuccess: invalidate,
		});
	const requestRegistrationApprovalMutation =
		electronTrpc.atlas.featureStudio.requestRegistrationApproval.useMutation({
			onSuccess: invalidate,
		});
	const registerRequestMutation =
		electronTrpc.atlas.featureStudio.registerRequest.useMutation({
			onSuccess: invalidate,
		});

	if (isLoading || !request) {
		return (
			<div className="flex items-center justify-center py-12">
				<Spinner className="size-5" />
			</div>
		);
	}

	return (
		<div className="space-y-6 p-6">
			<div className="flex items-center justify-between gap-4">
				<Button asChild variant="ghost" size="sm">
					<Link to="/atlas/studio">목록으로</Link>
				</Button>
			</div>

			<FeatureStudioRequestDetail
				request={request}
				onAdvance={() => advanceMutation.mutate({ featureRequestId: requestId })}
				onRequestRegistrationApproval={() =>
					requestRegistrationApprovalMutation.mutate({
						featureRequestId: requestId,
					})
				}
				onRegister={() =>
					registerRequestMutation.mutate({
						featureRequestId: requestId,
					})
				}
				onApprovalAction={(approvalId, action, feedback) =>
					respondToApprovalMutation.mutate({
						approvalId,
						action,
						feedback,
					})
				}
			/>
		</div>
	);
}
