/**
 * Video Player - HTML5 비디오 플레이어 (이어듣기 지원)
 */
import { useRef, useEffect, useCallback, useState } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Slider } from "@superbuilder/feature-ui/shadcn/slider";
import { cn } from "@superbuilder/feature-ui/lib/utils";

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

interface Props {
  videoUrl: string;
  startPosition?: number;
  onTimeUpdate?: (currentTime: number) => void;
  onEnded?: () => void;
  onDurationChange?: (duration: number) => void;
}

export function VideoPlayer({
  videoUrl,
  startPosition = 0,
  onTimeUpdate,
  onEnded,
  onDurationChange,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasSetStartPosition = useRef(false);

  // 시작 위치 설정 (이어듣기)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      if (startPosition > 0 && !hasSetStartPosition.current) {
        video.currentTime = startPosition;
        hasSetStartPosition.current = true;
      }
      setDuration(video.duration);
      onDurationChange?.(video.duration);
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    return () => video.removeEventListener("loadedmetadata", handleLoadedMetadata);
  }, [startPosition, onDurationChange]);

  // 비디오 URL 변경 시 상태 초기화
  useEffect(() => {
    hasSetStartPosition.current = false;
    setIsPlaying(false);
    setCurrentTime(0);
  }, [videoUrl]);

  // 시간 업데이트
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      onTimeUpdate?.(video.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      onEnded?.();
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
    };
  }, [onTimeUpdate, onEnded]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  const handleSeek = useCallback((value: number | readonly number[]) => {
    const video = videoRef.current;
    if (!video) return;
    const seekTo = Array.isArray(value) ? value[0] : value;
    if (seekTo == null) return;
    video.currentTime = seekTo;
    setCurrentTime(seekTo);
  }, []);

  const skip = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
  }, []);

  const cyclePlaybackRate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const currentIdx = PLAYBACK_RATES.indexOf(playbackRate as (typeof PLAYBACK_RATES)[number]);
    const nextIdx = (currentIdx + 1) % PLAYBACK_RATES.length;
    const nextRate = PLAYBACK_RATES[nextIdx]!;
    video.playbackRate = nextRate;
    setPlaybackRate(nextRate);
  }, [playbackRate]);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen();
    }
  }, []);

  // 컨트롤 자동 숨김
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  }, [isPlaying]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative bg-black rounded-lg overflow-hidden group"
      onMouseMove={resetHideTimer}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full aspect-video cursor-pointer"
        onClick={togglePlay}
        playsInline
      />

      {/* 컨트롤 오버레이 */}
      <div
        className={cn(
          "absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/60 to-transparent transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      >
        {/* 진행 바 */}
        <div className="px-4 pb-1">
          <Slider
            value={[currentTime]}
            min={0}
            max={duration || 1}
            step={1}
            onValueChange={handleSeek}
            className="cursor-pointer"
          />
        </div>

        {/* 컨트롤 버튼 */}
        <div className="flex items-center justify-between px-4 pb-3">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/20" onClick={() => skip(-10)}>
              <SkipBack className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/20" onClick={togglePlay}>
              {isPlaying ? <Pause className="size-5" /> : <Play className="size-5" />}
            </Button>
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/20" onClick={() => skip(10)}>
              <SkipForward className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/20" onClick={toggleMute}>
              {isMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </Button>
            <span className="text-sm text-white/80 ml-2">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/20 text-xs font-mono min-w-[40px]"
              onClick={cyclePlaybackRate}
            >
              {playbackRate}x
            </Button>
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/20" onClick={toggleFullscreen}>
              <Maximize className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* 중앙 재생 버튼 (일시정지 상태) */}
      {!isPlaying && (
        <button
          className="absolute inset-0 flex items-center justify-center"
          onClick={togglePlay}
        >
          <div className="rounded-full bg-black/50 p-4">
            <Play className="size-8 text-white" />
          </div>
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
