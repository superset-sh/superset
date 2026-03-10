/**
 * Curriculum Sidebar - 학습 뷰어 커리큘럼 사이드바
 */
import { CheckCircle, PlayCircle, ChevronDown } from "lucide-react";
import { Progress } from "@superbuilder/feature-ui/shadcn/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@superbuilder/feature-ui/shadcn/collapsible";
import { cn } from "@superbuilder/feature-ui/lib/utils";

interface Props {
  sections: SectionProgress[];
  currentLessonId: string | null;
  overallProgress: { completedLessons: number; totalLessons: number; percent: number };
  onSelectLesson: (lessonId: string) => void;
}

export function CurriculumSidebar({
  sections,
  currentLessonId,
  overallProgress,
  onSelectLesson,
}: Props) {
  return (
    <div className="flex flex-col h-full">
      {/* 진행률 요약 */}
      <div className="py-5 px-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold tracking-tight text-foreground/90">수강 진행률</span>
          <span className="text-muted-foreground/80 font-medium text-xs">
            {Math.round(overallProgress.percent)}%
          </span>
        </div>
        <Progress value={overallProgress.percent} className="h-1.5" />
        <p className="text-xs font-medium text-muted-foreground">
          {overallProgress.completedLessons}/{overallProgress.totalLessons} 레슨 완료
        </p>
      </div>

      {/* 섹션 목록 */}
      <div className="flex-1 overflow-y-auto">
        {sections.map((section, index) => (
          <SectionItem
            key={section.id}
            section={section}
            index={index}
            currentLessonId={currentLessonId}
            onSelectLesson={onSelectLesson}
          />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface SectionItemProps {
  section: SectionProgress;
  index: number;
  currentLessonId: string | null;
  onSelectLesson: (lessonId: string) => void;
}

function SectionItem({ section, index, currentLessonId, onSelectLesson }: SectionItemProps) {
  const hasCurrentLesson = section.lessons.some((l) => l.id === currentLessonId);

  return (
    <Collapsible defaultOpen={hasCurrentLesson || index === 0} className="group/section">
      <CollapsibleTrigger className="flex items-center justify-between w-full p-4 transition-colors hover:text-primary text-left">
        <div className="flex-1 min-w-0 pr-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground/50 w-5">{(index+1).toString().padStart(2, '0')}</span>
            <p className="text-sm font-medium truncate">{section.title}</p>
          </div>
          <p className="text-xs text-muted-foreground mt-1 ml-8">
            {section.completedLessons}/{section.totalLessons} 완료
          </p>
        </div>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/section:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pb-3 px-2">
          {section.lessons.map((lesson, lessonIndex) => (
            <LessonItem
              key={lesson.id}
              lesson={lesson}
              index={lessonIndex}
              isActive={lesson.id === currentLessonId}
              onClick={() => onSelectLesson(lesson.id)}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface LessonItemProps {
  lesson: LessonProgress;
  index: number;
  isActive: boolean;
  onClick: () => void;
}

function LessonItem({ lesson, index, isActive, onClick }: LessonItemProps) {
  return (
    <button
      className={cn(
        "group/lesson flex items-center gap-3 w-full px-3 py-2.5 text-left transition-colors rounded-md",
        isActive ? "bg-primary/5 text-primary" : "hover:bg-muted/30 text-foreground/80 hover:text-foreground",
      )}
      onClick={onClick}
    >
      <div className="shrink-0 w-5 flex justify-center">
        {lesson.isCompleted ? (
          <CheckCircle className="size-4 text-green-600/80" />
        ) : isActive ? (
          <PlayCircle className="size-4 text-primary" />
        ) : (
          <span className="text-xs font-medium text-muted-foreground/50">
            {index + 1}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm truncate", isActive && "font-medium")}>
          {lesson.title}
        </p>
        {lesson.progressPercent > 0 && !lesson.isCompleted && (
          <div className="flex items-center gap-2 mt-1.5 px-0.5">
            <Progress value={lesson.progressPercent} className="h-1 flex-1 opacity-70" />
          </div>
        )}
      </div>
      {lesson.isFree && <span className="shrink-0 text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-sm">무료</span>}
    </button>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface LessonProgress {
  id: string;
  title: string;
  progressPercent: number;
  isCompleted: boolean;
  lastPosition: number;
  isFree?: boolean;
}

interface SectionProgress {
  id: string;
  title: string;
  completedLessons: number;
  totalLessons: number;
  percent: number;
  lessons: LessonProgress[];
}
