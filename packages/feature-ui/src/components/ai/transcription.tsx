"use client"

import { useControllableState } from "@radix-ui/react-use-controllable-state"
import type { ComponentProps, ReactNode } from "react"
import { createContext, useContext } from "react"
import { cn } from "../../lib/utils"

interface TranscriptionSegment {
  text: string
  startSecond: number
  endSecond: number
}

interface TranscriptionContextValue {
  segments: TranscriptionSegment[]
  currentTime: number
  onTimeUpdate: (time: number) => void
  onSeek?: (time: number) => void
}

const TranscriptionContext = createContext<TranscriptionContextValue | null>(null)

const useTranscription = () => {
  const context = useContext(TranscriptionContext)
  if (!context) {
    throw new Error("Transcription components must be used within Transcription")
  }
  return context
}

export type TranscriptionProps = Omit<ComponentProps<"div">, "children"> & {
  segments: TranscriptionSegment[]
  currentTime?: number
  onSeek?: (time: number) => void
  children: (segment: TranscriptionSegment, index: number) => ReactNode
}

export const Transcription = ({
  segments,
  currentTime: externalCurrentTime,
  onSeek,
  className,
  children,
  ...props
}: TranscriptionProps) => {
  const [currentTime, setCurrentTime] = useControllableState({
    prop: externalCurrentTime,
    defaultProp: 0,
    onChange: onSeek,
  })

  return (
    <TranscriptionContext.Provider
      value={{
        segments,
        currentTime: currentTime ?? 0,
        onTimeUpdate: setCurrentTime,
        onSeek,
      }}
    >
      <div
        className={cn("flex flex-wrap gap-1 text-sm leading-relaxed", className)}
        data-slot="transcription"
        {...props}
      >
        {segments
          .filter(segment => segment.text.trim())
          .map((segment, index) => children(segment, index))}
      </div>
    </TranscriptionContext.Provider>
  )
}

export type TranscriptionSegmentProps = ComponentProps<"button"> & {
  segment: TranscriptionSegment
  index: number
}

export const TranscriptionSegment = ({
  segment,
  index,
  className,
  onClick,
  ...props
}: TranscriptionSegmentProps) => {
  const { currentTime, onSeek } = useTranscription()

  const isActive = currentTime >= segment.startSecond && currentTime < segment.endSecond
  const isPast = currentTime >= segment.endSecond

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (onSeek) {
      onSeek(segment.startSecond)
    }
    onClick?.(event)
  }

  return (
    <button
      className={cn(
        "inline text-left",
        isActive && "text-primary",
        isPast && "text-muted-foreground",
        !(isActive || isPast) && "text-muted-foreground/60",
        onSeek && "cursor-pointer hover:text-foreground",
        !onSeek && "cursor-default",
        className,
      )}
      data-active={isActive}
      data-index={index}
      data-slot="transcription-segment"
      onClick={handleClick}
      type="button"
      {...props}
    >
      {segment.text}
    </button>
  )
}

/** Demo component for preview */
export default function TranscriptionDemo() {
  const sampleSegments: TranscriptionSegment[] = [
    { text: "Hello", startSecond: 0, endSecond: 0.5 },
    { text: "and", startSecond: 0.5, endSecond: 0.7 },
    { text: "welcome", startSecond: 0.7, endSecond: 1.2 },
    { text: "to", startSecond: 1.2, endSecond: 1.4 },
    { text: "this", startSecond: 1.4, endSecond: 1.6 },
    { text: "demonstration", startSecond: 1.6, endSecond: 2.3 },
    { text: "of", startSecond: 2.3, endSecond: 2.5 },
    { text: "the", startSecond: 2.5, endSecond: 2.7 },
    { text: "transcription", startSecond: 2.7, endSecond: 3.4 },
    { text: "component.", startSecond: 3.4, endSecond: 4.0 },
    { text: "Click", startSecond: 4.0, endSecond: 4.3 },
    { text: "any", startSecond: 4.3, endSecond: 4.5 },
    { text: "word", startSecond: 4.5, endSecond: 4.8 },
    { text: "to", startSecond: 4.8, endSecond: 5.0 },
    { text: "seek!", startSecond: 5.0, endSecond: 5.5 },
  ]

  return (
    <div className="w-full max-w-md p-4">
      <div className="rounded-lg border bg-background p-4">
        <Transcription
          segments={sampleSegments}
          currentTime={2.6}
          onSeek={time => console.log("Seek to:", time)}
        >
          {(segment, index) => <TranscriptionSegment key={index} segment={segment} index={index} />}
        </Transcription>
      </div>
    </div>
  )
}
