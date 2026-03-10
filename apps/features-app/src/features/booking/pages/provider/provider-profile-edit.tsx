/**
 * Provider Profile Edit - 프로필 편집 / 상담사 등록
 *
 * 등록된 상담사: 프로필 편집 폼
 * 미등록 유저: 상담사 등록 폼
 */
import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Save, X, Plus, UserPlus } from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import { cn } from "@superbuilder/feature-ui/lib/utils";
import { toast } from "sonner";
import {
  useMyProviderProfile,
  useRegisterAsProvider,
  useUpdateProviderProfile,
} from "../../hooks/use-provider-hooks";
import { useBookingCategories } from "../../hooks/use-booking-queries";

export function ProviderProfileEdit() {
  const {
    data: profile,
    isLoading: profileLoading,
  } = useMyProviderProfile();
  const { data: categories } = useBookingCategories();

  if (profileLoading) {
    return <ProfileSkeleton />;
  }

  // 미등록 → 등록 폼
  if (!profile) {
    return <RegisterForm categories={categories ?? []} />;
  }

  // 등록 완료 → 편집 폼
  return <EditForm profile={profile} categories={categories ?? []} />;
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface CategoryOption {
  id: string;
  name: string;
  slug: string;
}

interface RegisterFormProps {
  categories: CategoryOption[];
}

function RegisterForm({ categories }: RegisterFormProps) {
  const navigate = useNavigate();
  const register = useRegisterAsProvider();

  const [bio, setBio] = useState("");
  const [experienceYears, setExperienceYears] = useState<number>(0);
  const [consultationMode, setConsultationMode] = useState<
    "online" | "offline" | "hybrid"
  >("online");
  const [languages, setLanguages] = useState<string[]>(["ko"]);
  const [languageInput, setLanguageInput] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);

  const handleAddLanguage = () => {
    const lang = languageInput.trim();
    if (lang && !languages.includes(lang)) {
      setLanguages([...languages, lang]);
      setLanguageInput("");
    }
  };

  const handleRemoveLanguage = (lang: string) => {
    setLanguages(languages.filter((l) => l !== lang));
  };

  const handleToggleCategory = (categoryId: string) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId],
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (languages.length === 0) {
      toast.error("최소 1개의 언어를 입력해주세요.");
      return;
    }

    register.mutate(
      {
        bio: bio || undefined,
        experienceYears: experienceYears || undefined,
        consultationMode,
        languages,
        categoryIds: selectedCategoryIds,
      },
      {
        onSuccess: () => {
          toast.success("상담사 등록이 완료되었습니다.");
          navigate({ to: "/provider/dashboard" });
        },
        onError: (err) =>
          toast.error(err.message || "등록에 실패했습니다."),
      },
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold">상담사 등록</h1>
        <p className="text-muted-foreground mt-2">
          상담사로 등록하면 예약을 받고 세션을 진행할 수 있습니다.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <ProfileFormFields
          bio={bio}
          onBioChange={setBio}
          experienceYears={experienceYears}
          onExperienceYearsChange={setExperienceYears}
          consultationMode={consultationMode}
          onConsultationModeChange={setConsultationMode}
          languages={languages}
          languageInput={languageInput}
          onLanguageInputChange={setLanguageInput}
          onAddLanguage={handleAddLanguage}
          onRemoveLanguage={handleRemoveLanguage}
          categories={categories}
          selectedCategoryIds={selectedCategoryIds}
          onToggleCategory={handleToggleCategory}
        />

        <Separator />

        <div className="flex items-center gap-3">
          <Button
            type="submit"
            disabled={register.isPending}
            className="gap-2"
          >
            <UserPlus className="size-4" />
            {register.isPending ? "등록 중..." : "상담사 등록"}
          </Button>
        </div>
      </form>
    </div>
  );
}

interface EditFormProps {
  profile: {
    id: string;
    bio?: string | null;
    experienceYears?: number | null;
    consultationMode: string;
    languages: string[];
    categoryIds?: string[];
    status?: string;
  };
  categories: CategoryOption[];
}

function EditForm({ profile, categories }: EditFormProps) {
  const navigate = useNavigate();
  const updateProfile = useUpdateProviderProfile();

  const [bio, setBio] = useState(profile.bio ?? "");
  const [experienceYears, setExperienceYears] = useState<number>(
    profile.experienceYears ?? 0,
  );
  const [consultationMode, setConsultationMode] = useState<
    "online" | "offline" | "hybrid"
  >(profile.consultationMode as "online" | "offline" | "hybrid");
  const [languages, setLanguages] = useState<string[]>(
    profile.languages ?? ["ko"],
  );
  const [languageInput, setLanguageInput] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(
    profile.categoryIds ?? [],
  );

  // profile 변경 시 다시 동기화
  useEffect(() => {
    setBio(profile.bio ?? "");
    setExperienceYears(profile.experienceYears ?? 0);
    setConsultationMode(
      profile.consultationMode as "online" | "offline" | "hybrid",
    );
    setLanguages(profile.languages ?? ["ko"]);
    setSelectedCategoryIds(profile.categoryIds ?? []);
  }, [profile]);

  const handleAddLanguage = () => {
    const lang = languageInput.trim();
    if (lang && !languages.includes(lang)) {
      setLanguages([...languages, lang]);
      setLanguageInput("");
    }
  };

  const handleRemoveLanguage = (lang: string) => {
    setLanguages(languages.filter((l) => l !== lang));
  };

  const handleToggleCategory = (categoryId: string) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId],
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    updateProfile.mutate(
      {
        bio: bio || undefined,
        experienceYears: experienceYears || undefined,
        consultationMode,
        languages,
        categoryIds:
          selectedCategoryIds.length > 0 ? selectedCategoryIds : undefined,
      },
      {
        onSuccess: () => toast.success("프로필이 저장되었습니다."),
        onError: (err) =>
          toast.error(err.message || "저장에 실패했습니다."),
      },
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate({ to: "/provider/dashboard" })}
        className="gap-2"
      >
        <ArrowLeft className="size-4" />
        대시보드
      </Button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">프로필 편집</h1>
          <p className="text-muted-foreground mt-2">
            상담사 정보를 수정하세요.
          </p>
        </div>
        {profile.status && <ProviderStatusBadge status={profile.status} />}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <ProfileFormFields
          bio={bio}
          onBioChange={setBio}
          experienceYears={experienceYears}
          onExperienceYearsChange={setExperienceYears}
          consultationMode={consultationMode}
          onConsultationModeChange={setConsultationMode}
          languages={languages}
          languageInput={languageInput}
          onLanguageInputChange={setLanguageInput}
          onAddLanguage={handleAddLanguage}
          onRemoveLanguage={handleRemoveLanguage}
          categories={categories}
          selectedCategoryIds={selectedCategoryIds}
          onToggleCategory={handleToggleCategory}
        />

        <Separator />

        <div className="flex items-center gap-3">
          <Button
            type="submit"
            disabled={updateProfile.isPending}
            className="gap-2"
          >
            <Save className="size-4" />
            {updateProfile.isPending ? "저장 중..." : "저장"}
          </Button>
        </div>
      </form>
    </div>
  );
}

interface ProfileFormFieldsProps {
  bio: string;
  onBioChange: (value: string) => void;
  experienceYears: number;
  onExperienceYearsChange: (value: number) => void;
  consultationMode: "online" | "offline" | "hybrid";
  onConsultationModeChange: (value: "online" | "offline" | "hybrid") => void;
  languages: string[];
  languageInput: string;
  onLanguageInputChange: (value: string) => void;
  onAddLanguage: () => void;
  onRemoveLanguage: (lang: string) => void;
  categories: CategoryOption[];
  selectedCategoryIds: string[];
  onToggleCategory: (categoryId: string) => void;
}

function ProfileFormFields({
  bio,
  onBioChange,
  experienceYears,
  onExperienceYearsChange,
  consultationMode,
  onConsultationModeChange,
  languages,
  languageInput,
  onLanguageInputChange,
  onAddLanguage,
  onRemoveLanguage,
  categories,
  selectedCategoryIds,
  onToggleCategory,
}: ProfileFormFieldsProps) {
  return (
    <>
      {/* 소개 */}
      <div className="space-y-2">
        <label className="text-sm font-medium">소개</label>
        <Textarea
          value={bio}
          onChange={(e) => onBioChange(e.target.value)}
          placeholder="자기소개를 입력하세요"
          maxLength={2000}
          rows={4}
        />
        <p className="text-sm text-muted-foreground">
          {bio.length}/2000
        </p>
      </div>

      {/* 경력 */}
      <div className="space-y-2">
        <label className="text-sm font-medium">경력 (년)</label>
        <Input
          type="number"
          min={0}
          max={100}
          value={experienceYears}
          onChange={(e) => onExperienceYearsChange(Number(e.target.value))}
          className="w-32"
        />
      </div>

      {/* 상담 방식 */}
      <div className="space-y-2">
        <label className="text-sm font-medium">상담 방식</label>
        <Select
          value={consultationMode}
          onValueChange={(v) =>
            onConsultationModeChange(v as "online" | "offline" | "hybrid")
          }
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="online">온라인</SelectItem>
            <SelectItem value="offline">오프라인</SelectItem>
            <SelectItem value="hybrid">온/오프라인 혼합</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 언어 */}
      <div className="space-y-2">
        <label className="text-sm font-medium">사용 언어</label>
        <div className="flex flex-wrap items-center gap-2">
          {languages.map((lang) => (
            <Badge key={lang} variant="secondary" className="gap-1">
              {LANGUAGE_LABELS[lang] ?? lang}
              <button
                type="button"
                onClick={() => onRemoveLanguage(lang)}
                className="ml-1 hover:text-destructive"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          <div className="flex items-center gap-1">
            <Input
              value={languageInput}
              onChange={(e) => onLanguageInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onAddLanguage();
                }
              }}
              placeholder="언어 코드 (예: en)"
              className="w-32 h-8"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onAddLanguage}
              className="h-8"
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Enter 키로 추가할 수 있습니다.
        </p>
      </div>

      {/* 카테고리 */}
      {categories.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium">전문 분야</label>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <Badge
                key={cat.id}
                variant={
                  selectedCategoryIds.includes(cat.id)
                    ? "default"
                    : "outline"
                }
                className={cn(
                  "cursor-pointer transition-colors",
                  selectedCategoryIds.includes(cat.id) &&
                    "bg-primary text-primary-foreground",
                )}
                onClick={() => onToggleCategory(cat.id)}
              >
                {cat.name}
              </Badge>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            해당하는 분야를 클릭하여 선택하세요.
          </p>
        </div>
      )}
    </>
  );
}

interface ProviderStatusBadgeProps {
  status: string;
}

function ProviderStatusBadge({ status }: ProviderStatusBadgeProps) {
  const config = PROVIDER_STATUS_CONFIG[status] ?? PROVIDER_STATUS_CONFIG.default ?? { label: "알 수 없음", className: "" };
  return (
    <Badge variant="secondary" className={config.className}>
      {config.label}
    </Badge>
  );
}

function ProfileSkeleton() {
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <Skeleton className="h-8 w-24" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-64" />
      </div>
      <div className="space-y-6">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const LANGUAGE_LABELS: Record<string, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
  zh: "中文",
};

const PROVIDER_STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  active: {
    label: "활성",
    className: "bg-green-100 text-green-800 hover:bg-green-100",
  },
  inactive: {
    label: "비활성",
    className: "bg-muted text-muted-foreground hover:bg-muted",
  },
  suspended: {
    label: "정지",
    className: "bg-red-100 text-red-800 hover:bg-red-100",
  },
  default: {
    label: "알 수 없음",
    className: "bg-muted text-muted-foreground hover:bg-muted",
  },
};
