import { useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { useCreatePost } from "../hooks";

interface PostSubmitFormProps {
  communitySlug: string;
}

export function PostSubmitForm({ communitySlug }: PostSubmitFormProps) {
  const navigate = useNavigate();
  const createPost = useCreatePost();

  const [formData, setFormData] = useState({
    title: "",
    content: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    const newErrors: Record<string, string> = {};
    if (formData.title.length < 1) {
      newErrors.title = "제목을 입력해주세요.";
    }
    if (!formData.content.trim()) {
      newErrors.content = "내용을 입력해주세요.";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      const result = await createPost.mutateAsync({
        communitySlug,
        title: formData.title,
        content: formData.content,
        type: "text",
      });
      navigate({ to: "/c/$slug/post/$postId", params: { slug: communitySlug, postId: result.id } });
    } catch (error: any) {
      const message = error?.message ?? "게시글 작성에 실패했습니다.";
      setServerError(message);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Link to="/c/$slug" params={{ slug: communitySlug }}>
        <Button variant="ghost" className="gap-2 -ml-2 mb-6">
          <ArrowLeft className="size-4" />
          c/{communitySlug}
        </Button>
      </Link>

      <div className="space-y-1 mb-8">
        <h1 className="text-2xl font-bold tracking-tight">새 게시글</h1>
        <p className="text-sm text-muted-foreground">c/{communitySlug}에 게시글을 작성합니다</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {serverError && (
          <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg">
            <AlertCircle className="size-4 shrink-0" />
            <span>{serverError}</span>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="title">제목</Label>
          <Input
            id="title"
            placeholder="게시글 제목을 입력하세요"
            value={formData.title}
            onChange={(e) => {
              setFormData((prev) => ({ ...prev, title: e.target.value }));
              if (errors.title) setErrors((prev) => ({ ...prev, title: "" }));
            }}
            aria-invalid={!!errors.title}
          />
          {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="content">내용</Label>
          <Textarea
            id="content"
            placeholder="내용을 입력하세요..."
            value={formData.content}
            onChange={(e) => {
              setFormData((prev) => ({ ...prev, content: e.target.value }));
              if (errors.content) setErrors((prev) => ({ ...prev, content: "" }));
            }}
            rows={12}
            aria-invalid={!!errors.content}
          />
          {errors.content && <p className="text-xs text-destructive">{errors.content}</p>}
        </div>

        <Separator />

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={createPost.isPending}>
            {createPost.isPending ? "등록 중..." : "게시글 등록"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate({ to: "/c/$slug", params: { slug: communitySlug } })}
          >
            취소
          </Button>
        </div>
      </form>
    </div>
  );
}
