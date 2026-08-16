import React, { useEffect, useState } from "react"
import { Activity } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { CalendarGrid, CalendarDayValue } from "@/components/d3/CalendarGrid"

interface GithubHeatmapProps {
  appId: string
  appName?: string
}

const wails = (window as any).go?.main?.App

export function GithubHeatmap({ appId, appName }: GithubHeatmapProps) {
  const [data, setData] = useState<CalendarDayValue[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [appId])

  const fetchData = async () => {
    setLoading(true)
    try {
      if (wails) {
        const res = await wails.GetAppUsageStats(appId, "year")
        if (res) {
          const formatted: CalendarDayValue[] = res.map((r: any) => ({
            date: r.label,
            value: r.duration_seconds,
          }))
          setData(formatted)
        }
      }
    } catch (err) {
      console.error("Error fetching heatmap data:", err)
    } finally {
      setLoading(false)
    }
  }

  const formatDuration = (seconds: number) => {
    if (seconds <= 0) return "No usage"
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    if (hrs > 0) return `${hrs}h ${mins}m`
    return `${mins}m`
  }

  return (
    <Card className="border border-border bg-card mt-6">
      <CardHeader>
        <CardTitle className="text-xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Yearly Activity Heatmap
        </CardTitle>
        <CardDescription className="text-slate-600 dark:text-slate-400 font-medium">
          365-day rectangular D3 activity grid
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[120px] flex items-center justify-center text-slate-500 font-semibold animate-pulse">
            Loading D3 heatmap...
          </div>
        ) : (
          <CalendarGrid data={data} formatValue={formatDuration} />
        )}
      </CardContent>
    </Card>
  )
}
