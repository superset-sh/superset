import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { HiOutlineFolder } from "react-icons/hi2";

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
  return (
    <div className="space-y-4 max-w-lg">
      <div className="space-y-2">
        <Label htmlFor="projectName">프로젝트 이름</Label>
        <Input
          id="projectName"
          value={projectName}
          onChange={(e) => onProjectNameChange(e.target.value)}
          placeholder="my-saas-project"
        />
        <p className="text-xs text-muted-foreground">
          GitHub 레포 이름으로도 사용됩니다
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
          <Button variant="outline" size="icon">
            <HiOutlineFolder className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
