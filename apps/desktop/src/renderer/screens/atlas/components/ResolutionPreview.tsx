import { Badge } from "@superset/ui/badge";

interface ResolutionPreviewProps {
  resolution: {
    selected: string[];
    autoIncluded: string[];
    resolved: string[];
    availableOptional: string[];
  };
}

export function ResolutionPreview({ resolution }: ResolutionPreviewProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium mb-2">
          선택한 Feature ({resolution.selected.length})
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {resolution.selected.map((id) => (
            <Badge key={id} variant="default">
              {id}
            </Badge>
          ))}
        </div>
      </div>

      {resolution.autoIncluded.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium mb-2">
            자동 포함 ({resolution.autoIncluded.length})
          </h3>
          <p className="text-xs text-muted-foreground mb-2">
            의존성으로 자동 포함되는 Feature
          </p>
          <div className="flex flex-wrap gap-1.5">
            {resolution.autoIncluded.map((id) => (
              <Badge key={id} variant="secondary">
                {id}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <h3 className="text-sm font-medium mb-2">
          최종 Feature 목록 ({resolution.resolved.length})
        </h3>
        <p className="text-xs text-muted-foreground mb-2">
          설치 순서 (토폴로지 정렬)
        </p>
        <div className="flex flex-wrap gap-1.5">
          {resolution.resolved.map((id, i) => (
            <span key={id} className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">
                {i + 1}.
              </span>
              <Badge variant="outline">{id}</Badge>
            </span>
          ))}
        </div>
      </div>

      {resolution.availableOptional.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium mb-2">
            사용 가능한 Optional Feature
          </h3>
          <p className="text-xs text-muted-foreground mb-2">
            추가하면 더 많은 기능을 활용할 수 있습니다
          </p>
          <div className="flex flex-wrap gap-1.5">
            {resolution.availableOptional.map((id) => (
              <Badge key={id} variant="outline" className="border-dashed">
                {id}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
