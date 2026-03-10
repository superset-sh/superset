"use client"

import {
  MediaControlBar,
  MediaController,
  MediaDurationDisplay,
  MediaMuteButton,
  MediaPlayButton,
  MediaSeekBackwardButton,
  MediaSeekForwardButton,
  MediaTimeDisplay,
  MediaTimeRange,
  MediaVolumeRange,
} from "media-chrome/react"
import type { ComponentProps, CSSProperties } from "react"
import { Button } from "../../_shadcn/button"
import { cn } from "../../lib/utils"

export type AudioPlayerProps = Omit<ComponentProps<typeof MediaController>, "audio">

export const AudioPlayer = ({ className, children, style, ...props }: AudioPlayerProps) => (
  <MediaController
    audio
    data-slot="audio-player"
    style={
      {
        "--media-button-icon-width": "1rem",
        "--media-button-icon-height": "1rem",
        "--media-icon-color": "currentColor",
        "--media-font": "var(--font-sans)",
        "--media-font-size": "10px",
        "--media-control-background": "transparent",
        "--media-control-hover-background": "var(--color-accent)",
        "--media-control-padding": "0",
        "--media-background-color": "transparent",
        "--media-primary-color": "var(--color-primary)",
        "--media-secondary-color": "var(--color-secondary)",
        "--media-text-color": "var(--color-foreground)",
        "--media-tooltip-background": "var(--color-background)",
        "--media-range-bar-color": "var(--color-primary)",
        "--media-tooltip-arrow-display": "none",
        "--media-tooltip-border-radius": "var(--radius-md)",
        "--media-preview-time-text-shadow": "none",
        "--media-preview-time-background": "var(--color-background)",
        "--media-preview-time-border-radius": "var(--radius-md)",
        "--media-range-track-background": "var(--color-secondary)",
        ...style,
      } as CSSProperties
    }
    {...props}
  >
    {children}
  </MediaController>
)

interface SpeechAudioData {
  base64: string
  mediaType: string
}

export type AudioPlayerElementProps = Omit<ComponentProps<"audio">, "src"> &
  (
    | {
        data: SpeechAudioData
      }
    | {
        src: string
      }
  )

export const AudioPlayerElement = ({ ...props }: AudioPlayerElementProps) => (
  <audio
    data-slot="audio-player-element"
    slot="media"
    src={"src" in props ? props.src : `data:${props.data.mediaType};base64,${props.data.base64}`}
    suppressHydrationWarning
    {...props}
  />
)

export type AudioPlayerControlBarProps = ComponentProps<typeof MediaControlBar>

export const AudioPlayerControlBar = ({
  children,
  className,
  ...props
}: AudioPlayerControlBarProps) => (
  <MediaControlBar
    data-slot="audio-player-control-bar"
    className={cn("flex items-center gap-1", className)}
    {...props}
  >
    {children}
  </MediaControlBar>
)

export type AudioPlayerPlayButtonProps = ComponentProps<typeof MediaPlayButton>

export const AudioPlayerPlayButton = ({ className, ...props }: AudioPlayerPlayButtonProps) => (
  <Button size="icon" variant="outline" className={cn("size-8", className)} render={<MediaPlayButton data-slot="audio-player-play-button" {...props} />}></Button>
)

export type AudioPlayerSeekBackwardButtonProps = ComponentProps<typeof MediaSeekBackwardButton>

export const AudioPlayerSeekBackwardButton = ({
  seekOffset = 10,
  className,
  ...props
}: AudioPlayerSeekBackwardButtonProps) => (
  <Button size="icon" variant="outline" className={cn("size-8", className)} render={<MediaSeekBackwardButton data-slot="audio-player-seek-backward-button" seekOffset={seekOffset} {...props} />}></Button>
)

export type AudioPlayerSeekForwardButtonProps = ComponentProps<typeof MediaSeekForwardButton>

export const AudioPlayerSeekForwardButton = ({
  seekOffset = 10,
  className,
  ...props
}: AudioPlayerSeekForwardButtonProps) => (
  <Button size="icon" variant="outline" className={cn("size-8", className)} render={<MediaSeekForwardButton data-slot="audio-player-seek-forward-button" seekOffset={seekOffset} {...props} />}></Button>
)

export type AudioPlayerTimeDisplayProps = ComponentProps<typeof MediaTimeDisplay>

export const AudioPlayerTimeDisplay = ({ className, ...props }: AudioPlayerTimeDisplayProps) => (
  <span className={cn("px-2 text-muted-foreground text-xs tabular-nums", className)}>
    <MediaTimeDisplay data-slot="audio-player-time-display" {...props} />
  </span>
)

export type AudioPlayerTimeRangeProps = ComponentProps<typeof MediaTimeRange>

export const AudioPlayerTimeRange = ({ className, ...props }: AudioPlayerTimeRangeProps) => (
  <MediaTimeRange
    className={cn("flex-1", className)}
    data-slot="audio-player-time-range"
    {...props}
  />
)

export type AudioPlayerDurationDisplayProps = ComponentProps<typeof MediaDurationDisplay>

export const AudioPlayerDurationDisplay = ({
  className,
  ...props
}: AudioPlayerDurationDisplayProps) => (
  <span className={cn("px-2 text-muted-foreground text-xs tabular-nums", className)}>
    <MediaDurationDisplay data-slot="audio-player-duration-display" {...props} />
  </span>
)

export type AudioPlayerMuteButtonProps = ComponentProps<typeof MediaMuteButton>

export const AudioPlayerMuteButton = ({ className, ...props }: AudioPlayerMuteButtonProps) => (
  <Button size="icon" variant="ghost" className={cn("size-8", className)} render={<MediaMuteButton data-slot="audio-player-mute-button" {...props} />}></Button>
)

export type AudioPlayerVolumeRangeProps = ComponentProps<typeof MediaVolumeRange>

export const AudioPlayerVolumeRange = ({ className, ...props }: AudioPlayerVolumeRangeProps) => (
  <MediaVolumeRange
    className={cn("w-20", className)}
    data-slot="audio-player-volume-range"
    {...props}
  />
)

/** Demo component for preview */
export default function AudioPlayerDemo() {
  return (
    <div className="w-full max-w-md p-4">
      <div className="rounded-lg border bg-background p-4">
        <AudioPlayer>
          <AudioPlayerElement src="https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3" />
          <AudioPlayerControlBar>
            <AudioPlayerPlayButton />
            <AudioPlayerSeekBackwardButton />
            <AudioPlayerSeekForwardButton />
            <AudioPlayerTimeDisplay />
            <AudioPlayerTimeRange />
            <AudioPlayerDurationDisplay />
            <AudioPlayerMuteButton />
            <AudioPlayerVolumeRange />
          </AudioPlayerControlBar>
        </AudioPlayer>
      </div>
    </div>
  )
}
