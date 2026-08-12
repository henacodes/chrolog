import * as React from "react"
import { cn } from "@/lib/utils"

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800 border border-slate-300/40 dark:border-slate-700/40",
        className
      )}
      {...props}
    >
      <div
        className="h-full w-full flex-1 bg-[#65A30D] dark:bg-[#C6FE1E] transition-all duration-300 ease-in-out"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </div>
  )
)
Progress.displayName = "Progress"

export { Progress }
