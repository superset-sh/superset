import { useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { ArrowLeft, AlertCircle, Globe, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Switch } from "@superbuilder/feature-ui/shadcn/switch";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { useCreateCommunity } from "../hooks";

const communityTypes = [
  {
    value: "public" as const,
    label: "공개",
    description: "누구나 볼 수 있고 게시글을 작성할 수 있습니다",
    icon: Globe,
  },
  {
    value: "restricted" as const,
    label: "제한",
    description: "누구나 볼 수 있지만 승인된 사용자만 게시할 수 있습니다",
    icon: ShieldCheck,
  },
  {
    value: "private" as const,
    label: "비공개",
    description: "승인된 사용자만 볼 수 있고 게시할 수 있습니다",
    icon: Lock,
  },
];

export function CreateCommunityForm() {
  const navigate = useNavigate();
  const createMutation = useCreateCommunity();

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    type: "public" as "public" | "restricted" | "private",
    isNsfw: false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    const newErrors: Record<string, string> = {};
    if (formData.name.length < 3) {
      newErrors.name = "이름은 최소 3자 이상이어야 합니다.";
    }
    if (formData.slug.length < 3) {
      newErrors.slug = "슬러그는 최소 3자 이상이어야 합니다.";
    }
    if (!/^[a-z0-9-]+$/.test(formData.slug)) {
      newErrors.slug = "슬러그는 소문자, 숫자, 하이픈만 사용할 수 있습니다.";
    }
    if (formData.description.length < 10) {
      newErrors.description = "설명은 최소 10자 이상이어야 합니다.";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      const result = await createMutation.mutateAsync(formData);
      navigate({ to: "/c/$slug", params: { slug: result.slug } });
    } catch (error: any) {
      const message = error?.message ?? "커뮤니티 생성에 실패했습니다.";
      setServerError(message);
    }
  };

  const handleSlugChange = (value: string) => {
    const slug = value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-");
    setFormData((prev) => ({ ...prev, slug }));
  };

  return (
    <div className="max-w-xl mx-auto">
      <Link to="/communities">
        <Button variant="ghost" className="gap-2 -ml-2 mb-6">
          <ArrowLeft className="size-4" />
          커뮤니티 목록
        </Button>
      </Link>

      <div className="space-y-1 mb-8">
        <h1 className="text-2xl font-bold tracking-tight">커뮤니티 만들기</h1>
        <p className="text-sm text-muted-foreground">
          나만의 커뮤니티를 만들어 콘텐츠를 공유하고 사람들과 소통하세요
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {serverError && (
          <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg">
            <AlertCircle className="size-4 shrink-0" />
            <span>{serverError}</span>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="name">커뮤니티 이름</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => {
              setFormData((prev) => ({ ...prev, name: e.target.value }));
              if (!formData.slug) handleSlugChange(e.target.value);
              if (errors.name) setErrors((prev) => ({ ...prev, name: "" }));
            }}
            placeholder="멋진 커뮤니티"
            aria-invalid={!!errors.name}
          />
          {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="slug">URL 슬러그</Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground shrink-0">c/</span>
            <Input
              id="slug"
              value={formData.slug}
              onChange={(e) => {
                handleSlugChange(e.target.value);
                if (errors.slug) setErrors((prev) => ({ ...prev, slug: "" }));
              }}
              placeholder="my-community"
              aria-invalid={!!errors.slug}
            />
          </div>
          {errors.slug ? (
            <p className="text-xs text-destructive">{errors.slug}</p>
          ) : (
            <p className="text-xs text-muted-foreground">소문자, 숫자, 하이픈만 사용 가능</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">설명</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => {
              setFormData((prev) => ({ ...prev, description: e.target.value }));
              if (errors.description) setErrors((prev) => ({ ...prev, description: "" }));
            }}
            placeholder="커뮤니티에 대해 설명해주세요..."
            rows={4}
            aria-invalid={!!errors.description}
          />
          {errors.description && <p className="text-xs text-destructive">{errors.description}</p>}
        </div>

        <Separator />

        <div className="space-y-3">
          <Label>커뮤니티 유형</Label>
          <div className="grid gap-2">
            {communityTypes.map((option) => {
              const Icon = option.icon;
              const isSelected = formData.type === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, type: option.value }))}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border text-left transition-colors",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  )}
                >
                  <Icon className={cn("size-4 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />
                  <div className="min-w-0">
                    <div className={cn("text-sm font-medium", isSelected && "text-primary")}>{option.label}</div>
                    <div className="text-xs text-muted-foreground">{option.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg border">
          <div>
            <div className="text-sm font-medium">18+ NSFW 커뮤니티</div>
            <div className="text-xs text-muted-foreground">모든 콘텐츠가 NSFW로 표시됩니다</div>
          </div>
          <Switch
            checked={formData.isNsfw}
            onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, isNsfw: !!checked }))}
          />
        </div>

        <Separator />

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "생성 중..." : "커뮤니티 만들기"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate({ to: "/communities" })}
          >
            취소
          </Button>
        </div>
      </form>
    </div>
  );
}
