import { useEffect, useState, type KeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { Slider } from "@superbuilder/feature-ui/shadcn/slider";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@superbuilder/feature-ui/shadcn/select";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@superbuilder/feature-ui/shadcn/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@superbuilder/feature-ui/shadcn/dialog";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import {
  ArrowLeft,
  Save,
  Loader2,
  Plus,
  X,
  Check,
  Trash2,
  Pencil,
  Sparkles,
} from "lucide-react";
import {
  useBrandProfile,
  useUpsertBrandProfile,
  useTonePresets,
  usePresetMutations,
  useSetActivePreset,
} from "../hooks";

interface Props {
  studioId: string;
}

export function BrandVoicePage({ studioId }: Props) {
  const profileQuery = useBrandProfile(studioId);
  const presetsQuery = useTonePresets(studioId);
  const { upsert } = useUpsertBrandProfile(studioId);
  const { createPreset, updatePreset, deletePreset } = usePresetMutations(studioId);
  const { setPreset } = useSetActivePreset(studioId);

  // 브랜드 프로필 폼 상태
  const [brandName, setBrandName] = useState("");
  const [industry, setIndustry] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [formality, setFormality] = useState(3);
  const [friendliness, setFriendliness] = useState(3);
  const [humor, setHumor] = useState(3);
  const [sentenceLength, setSentenceLength] = useState<"short" | "medium" | "long">("medium");
  const [forbiddenWords, setForbiddenWords] = useState<string[]>([]);
  const [forbiddenInput, setForbiddenInput] = useState("");
  const [requiredWords, setRequiredWords] = useState<string[]>([]);
  const [requiredInput, setRequiredInput] = useState("");
  const [additionalGuidelines, setAdditionalGuidelines] = useState("");

  // 프리셋 다이얼로그 상태
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<EditingPreset | null>(null);
  const [presetName, setPresetName] = useState("");
  const [presetDescription, setPresetDescription] = useState("");
  const [presetFormality, setPresetFormality] = useState(3);
  const [presetFriendliness, setPresetFriendliness] = useState(3);
  const [presetHumor, setPresetHumor] = useState(3);
  const [presetSentenceLength, setPresetSentenceLength] = useState<"short" | "medium" | "long">("medium");

  // 프로필 데이터 로드 시 폼 초기화
  useEffect(() => {
    if (!profileQuery.data) return;
    const p = profileQuery.data;
    setBrandName(p.brandName);
    setIndustry(p.industry ?? "");
    setTargetAudience(p.targetAudience ?? "");
    setFormality(p.formality);
    setFriendliness(p.friendliness);
    setHumor(p.humor);
    setSentenceLength(p.sentenceLength);
    setForbiddenWords(p.forbiddenWords ?? []);
    setRequiredWords(p.requiredWords ?? []);
    setAdditionalGuidelines(p.additionalGuidelines ?? "");
  }, [profileQuery.data]);

  const handleSaveProfile = () => {
    if (!brandName.trim()) return;
    upsert.mutate({
      studioId,
      brandName: brandName.trim(),
      industry: industry.trim() || undefined,
      targetAudience: targetAudience.trim() || undefined,
      formality,
      friendliness,
      humor,
      sentenceLength,
      forbiddenWords,
      requiredWords,
      additionalGuidelines: additionalGuidelines.trim() || undefined,
    });
  };

  const handleAddForbiddenWord = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const word = forbiddenInput.trim();
    if (word && !forbiddenWords.includes(word)) {
      setForbiddenWords([...forbiddenWords, word]);
    }
    setForbiddenInput("");
  };

  const handleRemoveForbiddenWord = (word: string) => {
    setForbiddenWords(forbiddenWords.filter((w) => w !== word));
  };

  const handleAddRequiredWord = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const word = requiredInput.trim();
    if (word && !requiredWords.includes(word)) {
      setRequiredWords([...requiredWords, word]);
    }
    setRequiredInput("");
  };

  const handleRemoveRequiredWord = (word: string) => {
    setRequiredWords(requiredWords.filter((w) => w !== word));
  };

  const handleSetActivePreset = (presetId: string) => {
    setPreset.mutate({ studioId, presetId });
  };

  const openCreatePresetDialog = () => {
    setEditingPreset(null);
    setPresetName("");
    setPresetDescription("");
    setPresetFormality(3);
    setPresetFriendliness(3);
    setPresetHumor(3);
    setPresetSentenceLength("medium");
    setPresetDialogOpen(true);
  };

  const openEditPresetDialog = (preset: PresetItem) => {
    setEditingPreset({ id: preset.id });
    setPresetName(preset.name);
    setPresetDescription(preset.description ?? "");
    setPresetFormality(preset.formality);
    setPresetFriendliness(preset.friendliness);
    setPresetHumor(preset.humor);
    setPresetSentenceLength(preset.sentenceLength);
    setPresetDialogOpen(true);
  };

  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    const data = {
      studioId,
      name: presetName.trim(),
      description: presetDescription.trim() || undefined,
      formality: presetFormality,
      friendliness: presetFriendliness,
      humor: presetHumor,
      sentenceLength: presetSentenceLength,
    };

    if (editingPreset) {
      updatePreset.mutate(
        { id: editingPreset.id, data },
        { onSuccess: () => setPresetDialogOpen(false) },
      );
    } else {
      createPreset.mutate(data, {
        onSuccess: () => setPresetDialogOpen(false),
      });
    }
  };

  const handleDeletePreset = (presetId: string) => {
    deletePreset.mutate({ id: presetId });
  };

  // 로딩 상태
  if (profileQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  // 에러 상태
  if (profileQuery.error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-6 py-12">
        <p className="text-muted-foreground">
          브랜드 보이스 설정을 불러오는 데 실패했습니다.
        </p>
        <Button variant="outline" onClick={() => profileQuery.refetch()}>
          다시 시도
        </Button>
      </div>
    );
  }

  const hasProfile = !!profileQuery.data;
  const activePresetId = profileQuery.data?.activePresetId ?? null;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl">
      {/* 상단 네비게이션 */}
      <div className="flex items-center gap-3">
        <Link to="/content-studio/$studioId" params={{ studioId }}>
          <Button variant="ghost" size="sm" className="h-8">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            캔버스
          </Button>
        </Link>
        <h1 className="text-2xl font-semibold">브랜드 보이스</h1>
      </div>

      {/* 빈 상태 (프로필 없음) */}
      {!hasProfile ? (
        <EmptyState onStart={() => setBrandName("")} />
      ) : null}

      {/* 탭 콘텐츠 */}
      <Tabs defaultValue={hasProfile ? "profile" : "profile"}>
        <TabsList>
          <TabsTrigger value="profile">브랜드 프로필</TabsTrigger>
          <TabsTrigger value="presets">톤 프리셋</TabsTrigger>
        </TabsList>

        {/* 브랜드 프로필 탭 */}
        <TabsContent value="profile" className="flex flex-col gap-6 mt-4">
          {!hasProfile && (
            <div className="rounded-lg bg-muted/30 p-6 text-center">
              <Sparkles className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-muted-foreground mb-4">
                브랜드 프로필을 설정하면 AI가 일관된 톤으로 콘텐츠를 생성합니다
              </p>
            </div>
          )}

          {/* 기본 정보 */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm text-muted-foreground">
                브랜드명 <span className="text-destructive">*</span>
              </label>
              <Input
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="브랜드 또는 회사 이름"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm text-muted-foreground">업종</label>
              <Input
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="예: IT/소프트웨어, 패션, F&B"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm text-muted-foreground">타겟 독자</label>
              <Input
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="예: 20-30대 개발자, 마케팅 실무자"
              />
            </div>
          </div>

          {/* 톤 슬라이더 */}
          <div className="flex flex-col gap-6">
            <h2 className="text-lg font-medium">톤 설정</h2>

            <ToneSlider
              label="격식"
              value={formality}
              onChange={setFormality}
              labels={FORMALITY_LABELS}
            />
            <ToneSlider
              label="친근함"
              value={friendliness}
              onChange={setFriendliness}
              labels={FRIENDLINESS_LABELS}
            />
            <ToneSlider
              label="유머"
              value={humor}
              onChange={setHumor}
              labels={HUMOR_LABELS}
            />
          </div>

          {/* 문장 길이 */}
          <div className="flex flex-col gap-2">
            <label className="text-sm text-muted-foreground">문장 길이</label>
            <Select value={sentenceLength} onValueChange={(v) => setSentenceLength(v as "short" | "medium" | "long")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="short">{SENTENCE_LENGTH_LABELS.short}</SelectItem>
                <SelectItem value="medium">{SENTENCE_LENGTH_LABELS.medium}</SelectItem>
                <SelectItem value="long">{SENTENCE_LENGTH_LABELS.long}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 금칙어 */}
          <TagInput
            label="금칙어"
            tags={forbiddenWords}
            inputValue={forbiddenInput}
            onInputChange={setForbiddenInput}
            onKeyDown={handleAddForbiddenWord}
            onRemove={handleRemoveForbiddenWord}
            placeholder="단어 입력 후 Enter"
          />

          {/* 필수어 */}
          <TagInput
            label="필수어"
            tags={requiredWords}
            inputValue={requiredInput}
            onInputChange={setRequiredInput}
            onKeyDown={handleAddRequiredWord}
            onRemove={handleRemoveRequiredWord}
            placeholder="단어 입력 후 Enter"
          />

          {/* 추가 가이드라인 */}
          <div className="flex flex-col gap-2">
            <label className="text-sm text-muted-foreground">추가 가이드라인</label>
            <Textarea
              value={additionalGuidelines}
              onChange={(e) => setAdditionalGuidelines(e.target.value)}
              placeholder="AI에게 전달할 추가 작성 규칙이나 참고사항"
              rows={4}
            />
          </div>

          {/* 저장 버튼 */}
          <div className="flex justify-end">
            <Button
              onClick={handleSaveProfile}
              disabled={!brandName.trim() || upsert.isPending}
            >
              {upsert.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {hasProfile ? "저장" : "시작하기"}
            </Button>
          </div>
        </TabsContent>

        {/* 톤 프리셋 탭 */}
        <TabsContent value="presets" className="flex flex-col gap-4 mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">톤 프리셋</h2>
            <Button variant="outline" size="sm" onClick={openCreatePresetDialog}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              프리셋 추가
            </Button>
          </div>

          {/* 프리셋 로딩 */}
          {presetsQuery.isLoading && (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-20 w-full rounded-lg" />
              <Skeleton className="h-20 w-full rounded-lg" />
              <Skeleton className="h-20 w-full rounded-lg" />
            </div>
          )}

          {/* 프리셋 에러 */}
          {presetsQuery.error && (
            <div className="flex flex-col items-center gap-3 py-8">
              <p className="text-muted-foreground">
                프리셋을 불러오는 데 실패했습니다.
              </p>
              <Button variant="outline" onClick={() => presetsQuery.refetch()}>
                다시 시도
              </Button>
            </div>
          )}

          {/* 프리셋 목록 */}
          {presetsQuery.data && presetsQuery.data.length === 0 && (
            <div className="rounded-lg bg-muted/30 p-6 text-center">
              <p className="text-muted-foreground">
                등록된 프리셋이 없습니다. 프리셋을 추가하여 다양한 톤을 빠르게 전환하세요.
              </p>
            </div>
          )}

          {presetsQuery.data?.map((preset) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              isActive={activePresetId === preset.id}
              onActivate={() => handleSetActivePreset(preset.id)}
              onEdit={() => openEditPresetDialog(preset)}
              onDelete={() => handleDeletePreset(preset.id)}
              isActivating={setPreset.isPending}
            />
          ))}

          {/* 프리셋 생성/편집 다이얼로그 */}
          <Dialog open={presetDialogOpen} onOpenChange={setPresetDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingPreset ? "프리셋 수정" : "프리셋 추가"}
                </DialogTitle>
              </DialogHeader>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-sm text-muted-foreground">
                    프리셋 이름 <span className="text-destructive">*</span>
                  </label>
                  <Input
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder="예: 블로그용, SNS용"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm text-muted-foreground">설명</label>
                  <Input
                    value={presetDescription}
                    onChange={(e) => setPresetDescription(e.target.value)}
                    placeholder="이 프리셋의 용도"
                  />
                </div>

                <ToneSlider
                  label="격식"
                  value={presetFormality}
                  onChange={setPresetFormality}
                  labels={FORMALITY_LABELS}
                />
                <ToneSlider
                  label="친근함"
                  value={presetFriendliness}
                  onChange={setPresetFriendliness}
                  labels={FRIENDLINESS_LABELS}
                />
                <ToneSlider
                  label="유머"
                  value={presetHumor}
                  onChange={setPresetHumor}
                  labels={HUMOR_LABELS}
                />

                <div className="flex flex-col gap-2">
                  <label className="text-sm text-muted-foreground">문장 길이</label>
                  <Select
                    value={presetSentenceLength}
                    onValueChange={(v) => setPresetSentenceLength(v as "short" | "medium" | "long")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="short">{SENTENCE_LENGTH_LABELS.short}</SelectItem>
                      <SelectItem value="medium">{SENTENCE_LENGTH_LABELS.medium}</SelectItem>
                      <SelectItem value="long">{SENTENCE_LENGTH_LABELS.long}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setPresetDialogOpen(false)}
                >
                  취소
                </Button>
                <Button
                  onClick={handleSavePreset}
                  disabled={
                    !presetName.trim() ||
                    createPreset.isPending ||
                    updatePreset.isPending
                  }
                >
                  {(createPreset.isPending || updatePreset.isPending) ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {editingPreset ? "수정" : "추가"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const FORMALITY_LABELS = ["반말체", "구어체", "보통체", "존댓말", "격식체"];
const FRIENDLINESS_LABELS = ["매우 딱딱한", "딱딱한", "보통", "친근한", "매우 친근한"];
const HUMOR_LABELS = ["매우 진지한", "진지한", "보통", "가벼운", "유머러스한"];
const SENTENCE_LENGTH_LABELS: Record<string, string> = {
  short: "짧고 간결한",
  medium: "보통",
  long: "상세한",
};

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface ToneSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  labels: string[];
}

function ToneSlider({ label, value, onChange, labels }: ToneSliderProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-sm text-muted-foreground">{label}</label>
        <span className="text-sm font-medium">{labels[value - 1]}</span>
      </div>
      <Slider
        value={[value]}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
        min={1}
        max={5}
        step={1}
      />
      <div className="flex justify-between text-sm text-muted-foreground/70">
        <span>{labels[0]}</span>
        <span>{labels[4]}</span>
      </div>
    </div>
  );
}

interface TagInputProps {
  label: string;
  tags: string[];
  inputValue: string;
  onInputChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onRemove: (tag: string) => void;
  placeholder: string;
}

function TagInput({
  label,
  tags,
  inputValue,
  onInputChange,
  onKeyDown,
  onRemove,
  placeholder,
}: TagInputProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm text-muted-foreground">{label}</label>
      <Input
        value={inputValue}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
      />
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              {tag}
              <button
                type="button"
                onClick={() => onRemove(tag)}
                className="ml-1 rounded-sm hover:bg-muted"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

interface EmptyStateProps {
  onStart: () => void;
}

function EmptyState({ onStart: _onStart }: EmptyStateProps) {
  return null;
}

interface PresetCardProps {
  preset: PresetItem;
  isActive: boolean;
  onActivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isActivating: boolean;
}

function PresetCard({
  preset,
  isActive,
  onActivate,
  onEdit,
  onDelete,
  isActivating,
}: PresetCardProps) {
  return (
    <div
      className={`flex items-start justify-between rounded-lg border p-4 ${
        isActive ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{preset.name}</span>
          {preset.isSystem && (
            <Badge variant="outline" className="text-muted-foreground">
              시스템
            </Badge>
          )}
          {isActive && (
            <Badge className="bg-primary text-primary-foreground">
              <Check className="mr-1 h-3 w-3" />
              활성
            </Badge>
          )}
        </div>
        {preset.description && (
          <p className="text-sm text-muted-foreground truncate">
            {preset.description}
          </p>
        )}
        <div className="flex gap-3 mt-1 text-sm text-muted-foreground/70">
          <span>격식: {FORMALITY_LABELS[preset.formality - 1]}</span>
          <span>친근함: {FRIENDLINESS_LABELS[preset.friendliness - 1]}</span>
          <span>유머: {HUMOR_LABELS[preset.humor - 1]}</span>
        </div>
      </div>

      <div className="flex items-center gap-1 ml-3 shrink-0">
        {!isActive && (
          <Button
            variant="outline"
            size="sm"
            onClick={onActivate}
            disabled={isActivating}
          >
            {isActivating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "활성화"
            )}
          </Button>
        )}
        {!preset.isSystem && (
          <>
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface EditingPreset {
  id: string;
}

interface PresetItem {
  id: string;
  name: string;
  description: string | null;
  formality: number;
  friendliness: number;
  humor: number;
  sentenceLength: "short" | "medium" | "long";
  isSystem: boolean;
}
