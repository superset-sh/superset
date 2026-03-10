/**
 * Family Invite - 초대 수락/거절 (Auth)
 */
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Mail, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { useAcceptInvitation, useRejectInvitation } from "../hooks";

interface Props {}

export function FamilyInvite({}: Props) {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { token?: string };
  const token = search.token ?? "";

  const acceptInvitation = useAcceptInvitation();
  const rejectInvitation = useRejectInvitation();

  if (!token) {
    return (
      <div className="text-center py-16 space-y-4">
        <p className="text-muted-foreground">유효하지 않은 초대 링크입니다.</p>
        <Button variant="outline" onClick={() => navigate({ to: "/family" })}>
          가족 관리로 이동
        </Button>
      </div>
    );
  }

  if (acceptInvitation.isSuccess) {
    return (
      <div className="text-center py-16 space-y-4">
        <CheckCircle className="mx-auto size-12 text-green-600" />
        <div className="space-y-1">
          <p className="text-lg font-medium">초대를 수락했습니다</p>
          <p className="text-muted-foreground">가족 그룹에 참여되었습니다.</p>
        </div>
        <Button onClick={() => navigate({ to: "/family" })}>
          가족 관리로 이동
        </Button>
      </div>
    );
  }

  if (rejectInvitation.isSuccess) {
    return (
      <div className="text-center py-16 space-y-4">
        <XCircle className="mx-auto size-12 text-muted-foreground" />
        <div className="space-y-1">
          <p className="text-lg font-medium">초대를 거절했습니다</p>
        </div>
        <Button variant="outline" onClick={() => navigate({ to: "/family" })}>
          가족 관리로 이동
        </Button>
      </div>
    );
  }

  const errorMessage =
    acceptInvitation.error?.message ?? rejectInvitation.error?.message;

  return (
    <div className="mx-auto max-w-md py-16 space-y-6">
      <div className="text-center space-y-2">
        <Mail className="mx-auto size-12 text-primary" />
        <h1 className="text-2xl font-bold">가족 그룹 초대</h1>
        <p className="text-muted-foreground">
          가족 그룹에 초대되었습니다. 수락하시겠습니까?
        </p>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-center">
          <p className="text-sm text-destructive">{errorMessage}</p>
        </div>
      )}

      <div className="flex gap-3 justify-center">
        <Button
          variant="outline"
          onClick={() => rejectInvitation.mutate({ token })}
          disabled={rejectInvitation.isPending || acceptInvitation.isPending}
        >
          {rejectInvitation.isPending ? "처리 중..." : "거절"}
        </Button>
        <Button
          onClick={() => acceptInvitation.mutate({ token })}
          disabled={acceptInvitation.isPending || rejectInvitation.isPending}
        >
          {acceptInvitation.isPending ? "처리 중..." : "수락"}
        </Button>
      </div>
    </div>
  );
}
