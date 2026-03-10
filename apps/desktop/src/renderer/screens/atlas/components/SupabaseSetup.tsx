import { useState, useEffect } from "react";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { LuCheck, LuExternalLink, LuKeyboard } from "react-icons/lu";

interface SupabaseSetupProps {
  onComplete: (orgId: string, orgName: string) => void;
  onSkip: () => void;
}

export function SupabaseSetup({ onComplete, onSkip }: SupabaseSetupProps) {
  const [token, setToken] = useState("");
  const [step, setStep] = useState<"token" | "org">("token");

  const { data: status, isLoading: statusLoading, refetch: refetchStatus } =
    electronTrpc.atlas.supabase.getConnectionStatus.useQuery();

  const { data: orgs } =
    electronTrpc.atlas.supabase.listOrganizations.useQuery(undefined, {
      enabled: status?.connected === true,
    });

  const saveTokenMutation =
    electronTrpc.atlas.supabase.saveToken.useMutation({
      onSuccess: () => {
        refetchStatus();
        setStep("org");
      },
    });

  // If already connected, go straight to org selection
  useEffect(() => {
    if (status?.connected && step === "token") {
      setStep("org");
    }
  }, [status?.connected, step]);

  // 상태 로딩 중에는 아무것도 표시하지 않음
  if (statusLoading) {
    return null;
  }

  if (step === "token" && !status?.connected) {
    return (
      <div className="space-y-4 p-4 rounded-lg border border-border">
        <div className="flex items-center gap-2">
          <LuKeyboard className="size-5 text-primary" />
          <h3 className="text-sm font-semibold">Supabase 연결</h3>
        </div>

        <p className="text-xs text-muted-foreground">
          Supabase 대시보드에서 Personal Access Token을 생성하세요.
        </p>

        <Button
          variant="link"
          size="sm"
          className="p-0 h-auto text-xs"
          onClick={() => {
            window.open(
              "https://supabase.com/dashboard/account/tokens",
              "_blank",
            );
          }}
        >
          <LuExternalLink className="size-3 mr-1" />
          Supabase 토큰 페이지 열기
        </Button>

        <div className="flex gap-2">
          <Input
            type="password"
            placeholder="sbp_xxxxxxxxxxxxxxxx"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="font-mono text-xs"
          />
          <Button
            size="sm"
            disabled={!token.trim() || saveTokenMutation.isPending}
            onClick={() => saveTokenMutation.mutate({ token: token.trim() })}
          >
            {saveTokenMutation.isPending ? "확인 중..." : "연결"}
          </Button>
        </div>

        {saveTokenMutation.error ? (
          <p className="text-xs text-destructive">
            {saveTokenMutation.error.message}
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={onSkip}>
            나중에 연결
          </Button>
        </div>
      </div>
    );
  }

  // Org selection step
  return (
    <div className="space-y-4 p-4 rounded-lg border border-border">
      <div className="flex items-center gap-2">
        <LuCheck className="size-5 text-green-500" />
        <h3 className="text-sm font-semibold">Supabase 연결됨</h3>
      </div>

      <p className="text-xs text-muted-foreground">
        프로젝트를 생성할 조직을 선택하세요.
      </p>

      {orgs && orgs.length > 0 ? (
        <div className="space-y-2">
          {orgs.map((org) => (
            <Button
              key={org.id}
              variant="outline"
              onClick={() => onComplete(org.id, org.name)}
              className="w-full justify-start h-auto p-3 text-left"
            >
              <div>
                <p className="text-sm font-medium">{org.name}</p>
                <p className="text-xs text-muted-foreground">{org.slug}</p>
              </div>
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          조직을 불러오는 중...
        </p>
      )}

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={onSkip}>
          나중에 연결
        </Button>
      </div>
    </div>
  );
}
