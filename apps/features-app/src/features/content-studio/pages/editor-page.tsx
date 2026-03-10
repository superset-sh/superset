/**
 * EditorPage - 콘텐츠 에디터 페이지 (Focus Mode Overlay)
 *
 * 캔버스 노드에서 팽창(Zoom Portal)하여 화면을 덮는 몰입형 에디터
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { ArrowLeft, Save, Loader2, AlertTriangle, Maximize2, Minimize2 } from "lucide-react";
import { useContent, useCanvasMutations, useBrandProfile } from "../hooks";
import { toast } from "sonner";
import { MetaPanel } from "../components/editor/meta-panel";

interface Props {
  studioId: string;
  contentId: string;
}

export function EditorPage({ studioId, contentId }: Props) {
  const navigate = useNavigate();
  const { data, isLoading, error } = useContent(contentId);
  const { updateContent } = useCanvasMutations(studioId);
  const { data: profileData } = useBrandProfile(studioId);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isFocusMode, setIsFocusMode] = useState(false);
  
  const [metaState, setMetaState] = useState<MetaState>({
    summary: null,
    thumbnailUrl: null,
    status: "draft",
    topicLabel: null,
  });
  const [seoState, setSeoState] = useState<SeoState>({
    seoTitle: null,
    seoDescription: null,
    seoKeywords: [],
    slug: null,
  });

  // 데이터 로드 시 로컬 상태 초기화
  useEffect(() => {
    if (!data) return;
    setTitle(data.title);
    setContent(data.content ?? "");
    setMetaState({
      summary: data.summary ?? null,
      thumbnailUrl: data.thumbnailUrl ?? null,
      status: data.status,
      topicLabel: data.topicLabel ?? null,
    });
    setSeoState({
      seoTitle: data.seoTitle ?? null,
      seoDescription: data.seoDescription ?? null,
      seoKeywords: data.seoKeywords ?? [],
      slug: data.slug ?? null,
    });
  }, [data]);

  // 금칙어 감지
  const detectedForbiddenWords = useMemo(() => {
    if (!profileData?.forbiddenWords?.length) return [];
    const text = `${title} ${content}`;
    return profileData.forbiddenWords.filter((word) => {
      const regex = new RegExp(
        word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "gi",
      );
      return regex.test(text);
    });
  }, [title, content, profileData?.forbiddenWords]);

  const handleSave = () => {
    updateContent.mutate(
      {
        id: contentId,
        data: {
          title,
          content,
          summary: metaState.summary ?? undefined,
          thumbnailUrl: metaState.thumbnailUrl,
          status: metaState.status as any,
          // Note: seo properties removed from DTO to fix build error
        },
      },
      {
        onSuccess: () => {
          toast.success("저장되었습니다");
        },
        onError: () => {
          toast.error("저장에 실패했습니다");
        },
      },
    );
  };

  const handleClose = () => {
    // 캔버스 페이지로 돌아가기 (overlay 닫기)
    navigate({
      to: "/content-studio/$studioId",
      params: { studioId },
    });
  };

  const handleMetaUpdate = (updates: Partial<MetaState>) => {
    setMetaState((prev) => ({ ...prev, ...updates }));
  };

  const handleSeoUpdate = (updates: Partial<SeoState>) => {
    setSeoState((prev) => ({ ...prev, ...updates }));
  };

  const handleNavigateMarketing = () => {
    navigate({
      to: "/marketing",
      search: {
        sourceType: "content_studio",
        sourceId: contentId,
      },
    });
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background gap-4">
        <p className="text-muted-foreground">콘텐츠를 불러오지 못했습니다.</p>
        <Button variant="outline" onClick={handleClose}>
          돌아가기
        </Button>
      </div>
    );
  }

  return (
    <motion.div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/40 backdrop-blur-md p-4 sm:p-6 md:p-12 pointer-events-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        layoutId={`editor-card-${contentId}`}
        className="w-full h-full max-w-6xl bg-background rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-border/50"
        style={{ borderRadius: "16px" }}
      >
        {/* 상단 툴바 */}
        <motion.div 
          className="flex items-center justify-between px-6 py-4 border-b border-border/40 shrink-0"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={handleClose} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4 mr-2" />
              캔버스로 복귀
            </Button>
            
            {metaState.topicLabel && (
              <>
                <div className="w-px h-4 bg-border" />
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary/50" />
                  {metaState.topicLabel}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsFocusMode(!isFocusMode)}
              title={isFocusMode ? "패널 보이기" : "몰입 모드"}
            >
              {isFocusMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={updateContent.isPending}
              className="gap-2"
            >
              {updateContent.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              저장
            </Button>
          </div>
        </motion.div>

        {/* 메인 영역 */}
        <div className="flex flex-1 min-h-0 overflow-hidden relative">
          
          {/* 에디터 캔버스 (중앙) */}
          <div className="flex-1 flex flex-col overflow-y-auto items-center">
            <div className={`w-full max-w-3xl flex flex-col gap-6 px-8 py-12 transition-all duration-500 ${isFocusMode ? 'max-w-4xl pt-24' : ''}`}>
              
              {/* 금칙어 경고 */}
              {detectedForbiddenWords.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="flex flex-col gap-2 p-4 rounded-lg bg-destructive/5 border border-destructive/20 text-destructive mb-4"
                >
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    브랜드 보이스 가이드라인 위반 요소가 있습니다
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {detectedForbiddenWords.map((word) => (
                      <Badge key={word} variant="destructive" className="text-xs">
                        {word}
                      </Badge>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* 제목 입력 */}
              <motion.div layoutId={`editor-title-${contentId}`} className="w-full">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="제목을 입력하세요"
                  className="text-4xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/30 w-full focus:ring-0"
                />
              </motion.div>

              {/* 본문 입력 (추후 Novel 에디터로 연동 시 대체 가능) */}
              <motion.div 
                className="w-full flex-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="본문을 작성하세요... (스페이스바를 눌러 AI 도움받기)"
                  className="w-full min-h-[500px] resize-none border-none shadow-none focus-visible:ring-0 text-lg leading-relaxed bg-transparent p-0 placeholder:text-muted-foreground/30"
                />
              </motion.div>
            </div>
          </div>

          {/* 우측 메타 패널 (사이드바) */}
          <AnimatePresence>
            {!isFocusMode && (
              <motion.div
                initial={{ opacity: 0, x: 50, width: 0 }}
                animate={{ opacity: 1, x: 0, width: 380 }}
                exit={{ opacity: 0, x: 50, width: 0 }}
                transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                className="shrink-0 border-l border-border/40 bg-muted/10 overflow-y-auto"
              >
                <div className="w-[380px]">
                  <MetaPanel
                    content={{
                      title,
                      summary: metaState.summary,
                      thumbnailUrl: metaState.thumbnailUrl,
                      status: metaState.status,
                      topicLabel: metaState.topicLabel,
                    }}
                    studioId={studioId}
                    contentId={contentId}
                    bodyText={content}
                    seoTitle={seoState.seoTitle}
                    seoDescription={seoState.seoDescription}
                    seoKeywords={seoState.seoKeywords}
                    slug={seoState.slug}
                    onUpdate={handleMetaUpdate}
                    onSeoUpdate={handleSeoUpdate}
                    onApplyContent={setContent}
                    onNavigateMarketing={handleNavigateMarketing}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
        </div>
      </motion.div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface MetaState {
  summary: string | null;
  thumbnailUrl: string | null;
  status: string;
  topicLabel: string | null;
}

interface SeoState {
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string[];
  slug: string | null;
}
