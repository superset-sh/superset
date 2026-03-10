import { useState, useEffect } from "react";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { LuCheck, LuExternalLink, LuKeyboard } from "react-icons/lu";

interface VercelSetupProps {
  onComplete: (teamId: string | undefined, teamName: string) => void;
  onSkip: () => void;
}

export function VercelSetup({ onComplete, onSkip }: VercelSetupProps) {
  const [token, setToken] = useState("");
  const [step, setStep] = useState<"token" | "team">("token");

  const { data: status, isLoading: statusLoading, refetch: refetchStatus } =
    electronTrpc.atlas.vercel.getConnectionStatus.useQuery();

  const { data: teams } = electronTrpc.atlas.vercel.listTeams.useQuery(
    undefined,
    { enabled: status?.connected === true },
  );

  const saveTokenMutation =
    electronTrpc.atlas.vercel.saveToken.useMutation({
      onSuccess: () => {
        refetchStatus();
        setStep("team");
      },
    });

  useEffect(() => {
    if (status?.connected && step === "token") {
      setStep("team");
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
          <h3 className="text-sm font-semibold">Vercel 연결</h3>
        </div>

        <p className="text-xs text-muted-foreground">
          Vercel 대시보드에서 Personal Access Token을 생성하세요.
        </p>

        <Button
          variant="link"
          size="sm"
          className="p-0 h-auto text-xs"
          onClick={() => {
            window.open(
              "https://vercel.com/account/tokens",
              "_blank",
            );
          }}
        >
          <LuExternalLink className="size-3 mr-1" />
          Vercel 토큰 페이지 열기
        </Button>

        <div className="flex gap-2">
          <Input
            type="password"
            placeholder="vercel token"
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

  // Team selection step
  return (
    <div className="space-y-4 p-4 rounded-lg border border-border">
      <div className="flex items-center gap-2">
        <LuCheck className="size-5 text-green-500" />
        <h3 className="text-sm font-semibold">Vercel 연결됨</h3>
      </div>

      <p className="text-xs text-muted-foreground">
        프로젝트를 배포할 팀을 선택하세요. 개인 계정으로 배포하려면 &quot;개인
        계정&quot;을 선택하세요.
      </p>

      <div className="space-y-2">
        <Button
          variant="outline"
          onClick={() => onComplete(undefined, "Personal")}
          className="w-full justify-start h-auto p-3 text-left"
        >
          <div>
            <p className="text-sm font-medium">개인 계정</p>
            <p className="text-xs text-muted-foreground">Personal Account</p>
          </div>
        </Button>

        {teams && teams.length > 0
          ? teams.map((team) => (
              <Button
                key={team.id}
                variant="outline"
                onClick={() => onComplete(team.id, team.name)}
                className="w-full justify-start h-auto p-3 text-left"
              >
                <div>
                  <p className="text-sm font-medium">{team.name}</p>
                  <p className="text-xs text-muted-foreground">{team.slug}</p>
                </div>
              </Button>
            ))
          : null}
      </div>

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={onSkip}>
          나중에 연결
        </Button>
      </div>
    </div>
  );
}
