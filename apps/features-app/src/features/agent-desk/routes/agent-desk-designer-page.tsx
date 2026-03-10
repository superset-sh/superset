import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { AuthGuard, authenticatedAtom } from "@superbuilder/features-client/core/auth";
import { useAtomValue } from "jotai";
import { FlowDesigner } from "../pages/flow-designer";

export function AgentDeskDesignerPage() {
  const params = useParams({ strict: false });
  const sessionId = (params as Record<string, string | undefined>).sessionId;
  const navigate = useNavigate();
  const authenticated = useAtomValue(authenticatedAtom);

  const handleUnauthenticated = () => {
    navigate({ to: "/sign-in" });
  };

  useEffect(() => {
    if (!sessionId) {
      navigate({ to: "/agent-desk" });
    }
  }, [sessionId, navigate]);

  if (!sessionId) return null;

  return (
    <AuthGuard authenticated={authenticated} onUnauthenticated={handleUnauthenticated}>
      <FlowDesigner sessionId={sessionId} />
    </AuthGuard>
  );
}
