import React, { useEffect, useState, useRef } from "react"
import { Activity } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

interface AppUsageStat {
  label: string
  duration_seconds: number
}

interface GithubHeatmapProps {
  appId: string
  appName?: string
}

const wails = (window as any).go?.main?.App

export function GithubHeatmap({ appId, appName }: GithubHeatmapProps) {
  const [data, setData] = useState<AppUsageStat[]>([])
  const [loading, setLoading] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  const [hoverInfo, setHoverInfo] = useState<{
    x: number; 
    y: number; 
    dateStr: string; 
    duration: number; 
    quadrant: string;
  } | null>(null)

  useEffect(() => {
    fetchData()
  }, [appId])

  const fetchData = async () => {
    setLoading(true)
    try {
      if (wails) {
        const res = await wails.GetAppUsageStats(appId, "year")
        setData(res || [])
      }
    } catch (err) {
      console.error("Error fetching heatmap data:", err)
    } finally {
      setLoading(false)
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const days: (Date | null)[] = []
  const startDay = new Date(today)
  startDay.setDate(today.getDate() - 364)
  
  const startDayOfWeek = startDay.getDay()
  for (let i = 0; i < startDayOfWeek; i++) {
    days.push(null)
  }
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    days.push(d)
  }

  const weeks: (Date | null)[][] = []
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7))
  }

  const dataMap = new Map<string, number>()
  data.forEach(d => {
    dataMap.set(d.label, d.duration_seconds)
  })

  let maxDuration = 1;
  data.forEach(d => {
    if (d.duration_seconds > maxDuration) maxDuration = d.duration_seconds
  })

  const getLevel = (seconds: number) => {
    if (seconds === 0) return 0
    const ratio = seconds / maxDuration
    if (ratio <= 0.25) return 1
    if (ratio <= 0.5) return 2
    if (ratio <= 0.75) return 3
    return 4
  }

  const formatDuration = (seconds: number) => {
    if (seconds <= 0) return "0s"
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    if (hrs > 0) return `${hrs}h ${mins}m`
    return `${mins}m`
  }

  const handleMouseEnter = (e: React.MouseEvent, date: Date, seconds: number, col: number, row: number) => {
    if (!containerRef.current) return
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    const containerRect = containerRef.current.getBoundingClientRect()
    
    const x = rect.left - containerRect.left
    const y = rect.top - containerRect.top

    // Determine quadrant for opposite tooltip placement
    // rows: 0 to 6. cols: 0 to weeks.length
    const qY = row < 3 ? 'top' : 'bottom'
    const qX = col > weeks.length / 2 ? 'right' : 'left'

    setHoverInfo({
      x, 
      y,
      dateStr: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      duration: seconds,
      quadrant: `${qY}-${qX}`
    })
  }

  const renderTooltip = () => {
    if (!hoverInfo) return null
    const { x, y, dateStr, duration, quadrant } = hoverInfo

    const cellW = 12, cellH = 12
    const gap = 8

    let style: React.CSSProperties = {}

    if (quadrant.includes('top')) {
      style.top = y + cellH + gap
    } else {
      style.bottom = (containerRef.current?.clientHeight || 0) - y + gap
    }

    if (quadrant.includes('left')) {
      style.left = x + cellW + gap
    } else {
      style.right = (containerRef.current?.clientWidth || 0) - x + gap
    }

    return (
      <div 
        className="absolute z-50 bg-slate-900 text-slate-100 dark:bg-slate-100 dark:text-slate-900 px-3 py-2 rounded-md shadow-xl text-xs whitespace-nowrap pointer-events-none transition-all duration-150 ease-out"
        style={style}
      >
        <p className="font-bold text-[13px] mb-0.5">{duration > 0 ? formatDuration(duration) : "No usage"}</p>
        <p className="text-slate-400 dark:text-slate-500 font-medium">{dateStr}</p>
      </div>
    )
  }

  return (
    <Card className="border border-border bg-card mt-6">
      <CardHeader>
        <CardTitle className="text-xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Yearly Activity
        </CardTitle>
        <CardDescription className="text-slate-600 dark:text-slate-400 font-medium">
          365 days of usage history
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[120px] flex items-center justify-center text-slate-500 font-semibold animate-pulse">
            Loading heatmap...
          </div>
        ) : (
          <div 
            className="relative overflow-x-auto pb-4 pt-2"
            onMouseLeave={() => setHoverInfo(null)}
          >
            <div 
              ref={containerRef} 
              className="inline-flex gap-1 relative min-w-max p-2"
            >
              {renderTooltip()}
              
              {weeks.map((week, colIdx) => (
                <div key={colIdx} className="flex flex-col gap-1">
                  {week.map((day, rowIdx) => {
                    if (!day) return <div key={rowIdx} className="w-3 h-3 bg-transparent" />
                    
                    const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
                    const seconds = dataMap.get(dateStr) || 0
                    const level = getLevel(seconds)
                    
                    const colorClasses = [
                      "bg-slate-100 dark:bg-slate-800 hover:ring-1 hover:ring-slate-300 dark:hover:ring-slate-600",
                      "bg-[#d6e685] dark:bg-[#0e4429] hover:ring-1 hover:ring-slate-400 dark:hover:ring-slate-500",
                      "bg-[#8cc665] dark:bg-[#006d32] hover:ring-1 hover:ring-slate-400 dark:hover:ring-slate-500",
                      "bg-[#44a340] dark:bg-[#26a641] hover:ring-1 hover:ring-slate-400 dark:hover:ring-slate-500",
                      "bg-[#1e6823] dark:bg-[#39d353] hover:ring-1 hover:ring-slate-400 dark:hover:ring-slate-500"
                    ]
                    
                    return (
                      <div 
                        key={rowIdx} 
                        className={`w-3 h-3 rounded-sm ${colorClasses[level]} cursor-pointer transition-colors`}
                        onMouseEnter={(e) => handleMouseEnter(e, day, seconds, colIdx, rowIdx)}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
