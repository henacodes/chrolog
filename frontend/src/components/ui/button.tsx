import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-500 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-[#558B2F] dark:bg-[#C6FE1E] text-white dark:text-slate-950 shadow-sm hover:bg-[#487727] dark:hover:bg-[#b5eb16] font-black",
        destructive:
          "bg-red-600 text-white shadow-sm hover:bg-red-500",
        outline:
          "border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700",
        secondary:
          "bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100 hover:bg-slate-300 dark:hover:bg-slate-700",
        ghost:
          "hover:bg-slate-200/70 dark:hover:bg-slate-800/70 text-slate-900 dark:text-slate-100",
        lime:
          "bg-[#558B2F] dark:bg-[#C6FE1E] text-white dark:text-slate-950 hover:bg-[#487727] dark:hover:bg-[#b0e615] font-black tracking-wide shadow-sm",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-11 rounded-xl px-8 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
