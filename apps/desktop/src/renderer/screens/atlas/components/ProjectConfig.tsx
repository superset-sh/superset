import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { LuFolderOpen } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface ProjectConfigProps {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  targetPath: string;
  onTargetPathChange: (path: string) => void;
}

export function ProjectConfig({
  projectName,
  onProjectNameChange,
  targetPath,
  onTargetPathChange,
}: ProjectConfigProps) {
  const selectDirectory = electronTrpc.projects.selectDirectory.useMutation();

  const handleBrowse = () => {
    selectDirectory.mutate(
      { defaultPath: targetPath || undefined },
      {
        onSuccess: (result) => {
          if (!result.canceled && result.path) {
            onTargetPathChange(result.path);
          }
        },
      },
    );
  };

  return (
    <div className="space-y-4 max-w-lg">
      <div className="space-y-2">
        <Label htmlFor="projectName">프로젝트 이름</Label>
        <Input
          id="projectName"
          value={projectName}
          onChange={(e) => {
            // 영문, 숫자, 하이픈, 언더스코어만 허용
            const filtered = e.target.value.replace(/[^a-zA-Z0-9\-_]/g, "");
            onProjectNameChange(filtered);
          }}
          placeholder="my-saas-project"
          pattern="[a-zA-Z0-9\-_]+"
        />
        <p className="text-xs text-muted-foreground">
          영문, 숫자, 하이픈(-), 언더스코어(_)만 사용 가능합니다
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="targetPath">저장 경로</Label>
        <div className="flex gap-2">
          <Input
            id="targetPath"
            value={targetPath}
            onChange={(e) => onTargetPathChange(e.target.value)}
            placeholder="/Users/username/Projects/my-saas-project"
            className="flex-1"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={handleBrowse}
            disabled={selectDirectory.isPending}
          >
            <LuFolderOpen className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
