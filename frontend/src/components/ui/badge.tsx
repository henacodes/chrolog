import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground font-medium shadow-none",
        secondary:
          "border-border bg-secondary text-secondary-foreground font-medium",
        destructive:
          "border-transparent bg-destructive/10 text-destructive border-destructive/20",
        outline: "text-foreground border-border bg-transparent",
        success: "border-transparent bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
        lime: "border-transparent bg-primary/10 text-primary border-primary/20 font-medium",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
