/**
 * SeoScoreGauge - SEO 점수 원형 게이지
 *
 * 0~100 점수를 SVG 원형 프로그레스로 시각화한다.
 * 점수 구간에 따라 색상이 변경된다 (빨강/노랑/초록).
 */
import { cn } from "@superbuilder/feature-ui/lib/utils";

interface Props {
  score: number;
  maxScore: number;
}

export function SeoScoreGauge({ score, maxScore }: Props) {
  const clampedScore = Math.max(0, Math.min(score, maxScore));
  const ratio = maxScore > 0 ? clampedScore / maxScore : 0;
  const colorClass = getScoreColorClass(clampedScore);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg viewBox="0 0 120 120" className="size-28">
        {/* 배경 원 */}
        <circle
          cx="60"
          cy="60"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-muted/20"
        />
        {/* 진행 원 */}
        <circle
          cx="60"
          cy="60"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          className={cn("transition-[stroke-dashoffset] duration-500 ease-out", colorClass)}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - ratio)}
          style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
        />
        {/* 중앙 점수 텍스트 */}
        <text
          x="60"
          y="56"
          textAnchor="middle"
          dominantBaseline="central"
          className={cn("fill-current text-2xl font-bold", colorClass)}
        >
          {clampedScore}
        </text>
        <text
          x="60"
          y="76"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-current text-sm text-muted-foreground"
        >
          / {maxScore}
        </text>
      </svg>
      <span className="text-sm text-muted-foreground text-center">
        분석 점수
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

/** 점수 구간별 색상 클래스 반환 */
function getScoreColorClass(score: number): string {
  if (score <= 40) return "text-destructive";
  if (score <= 70) return "text-yellow-600";
  return "text-green-600";
}
