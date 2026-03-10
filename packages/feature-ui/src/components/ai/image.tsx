import type { Experimental_GeneratedImage } from "ai"
import { cn } from "../../lib/utils"

export type ImageProps = Experimental_GeneratedImage & {
  className?: string
  alt?: string
}

export const Image = ({ base64, uint8Array, mediaType, ...props }: ImageProps) => (
  <img
    {...props}
    alt={props.alt}
    className={cn("h-auto max-w-full overflow-hidden rounded-md", props.className)}
    height={400}
    src={`data:${mediaType};base64,${base64}`}
    width={400}
  />
)

/** Demo component for preview */
export default function ImageDemo() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-[200px] w-[200px] overflow-hidden rounded-md border bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400">
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-medium text-white text-xl">AI Generated</span>
          </div>
        </div>
        <p className="text-muted-foreground text-sm">Base64-encoded image from AI SDK</p>
      </div>
    </div>
  )
}
