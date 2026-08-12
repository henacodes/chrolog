import { useEffect, useState } from "react"
import { ArrowLeft, BarChart3, LineChart, History, Activity } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart as RechartsLineChart,
  Line
} from "recharts"

interface AppDetailsProps {
  appId: string
  appName: string
  appIcon?: string
  onBack: () => void
}

interface AppUsageStat {
  label: string
  duration_seconds: number
}

interface SessionRecord {
  id: number
  app_id: string
  app_name: string
  window_title: string
  source: string
  started_at: string
  ended_at: string
  duration_seconds: number
}

// Access Wails runtime & Go methods
const wails = (window as any).go?.main?.App

export function AppDetails({ appId, appName, appIcon, onBack }: AppDetailsProps) {
  const [stats, setStats] = useState<AppUsageStat[]>([])
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [timeframe, setTimeframe] = useState<string>("today") // today, week, month
  const [chartType, setChartType] = useState<"bar" | "line">("bar")
  const [viewMode, setViewMode] = useState<"graphs" | "sessions">("graphs")
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    fetchData()
  }, [appId, timeframe, viewMode])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      if (wails) {
        if (viewMode === "graphs") {
          const res = await wails.GetAppUsageStats(appId, timeframe)
          setStats(res || [])
        } else {
          const res = await wails.GetAppSessionHistory(appId, 100) // limit 100
          setSessions(res || [])
        }
      } else {
        setMockData()
      }
    } catch (err) {
      console.error("Error fetching app details:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const setMockData = () => {
    if (viewMode === "graphs") {
      if (timeframe === "today") {
        setStats([
          { label: "09:00", duration_seconds: 1200 },
          { label: "10:00", duration_seconds: 3400 },
          { label: "11:00", duration_seconds: 1800 },
          { label: "12:00", duration_seconds: 500 },
          { label: "13:00", duration_seconds: 2200 },
        ])
      } else if (timeframe === "week") {
        setStats([
          { label: "Mon", duration_seconds: 14200 },
          { label: "Tue", duration_seconds: 23400 },
          { label: "Wed", duration_seconds: 18800 },
          { label: "Thu", duration_seconds: 15500 },
        ])
      } else {
        setStats([
          { label: "Week 1", duration_seconds: 54200 },
          { label: "Week 2", duration_seconds: 63400 },
          { label: "Week 3", duration_seconds: 48800 },
        ])
      }
    } else {
      setSessions([
        {
          id: 1, app_id: appId, app_name: appName, window_title: "Focus Document", source: "hyprland",
          started_at: new Date(Date.now() - 3600000).toISOString(),
          ended_at: new Date(Date.now() - 3000000).toISOString(),
          duration_seconds: 600
        },
        {
          id: 2, app_id: appId, app_name: appName, window_title: "Project Files", source: "hyprland",
          started_at: new Date(Date.now() - 7200000).toISOString(),
          ended_at: new Date(Date.now() - 3600000).toISOString(),
          duration_seconds: 3600
        },
      ])
    }
  }

  const formatDuration = (seconds: number) => {
    if (seconds <= 0) return "0s"
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hrs > 0) return `${hrs}h ${mins}m`
    if (mins > 0) return `${mins}m ${secs}s`
    return `${secs}s`
  }

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString)
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" })
    } catch {
      return ""
    }
  }

  const formatTooltip = (value: number) => {
    return [formatDuration(value), "Duration"]
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button variant="outline" onClick={onBack} className="gap-2 rounded-xl">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Button>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#111315] p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold">
            <button
              onClick={() => setViewMode("graphs")}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                viewMode === "graphs"
                  ? "bg-white dark:bg-[#1C1F23] text-slate-900 dark:text-slate-100 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
            >
              <BarChart3 className="h-4 w-4" /> Graphs
            </button>
            <button
              onClick={() => setViewMode("sessions")}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                viewMode === "sessions"
                  ? "bg-white dark:bg-[#1C1F23] text-slate-900 dark:text-slate-100 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
            >
              <History className="h-4 w-4" /> Sessions
            </button>
          </div>
        </div>
      </div>

      {/* App Header Info */}
      <Card className="border border-slate-200 dark:border-[#2B3036] bg-white dark:bg-[#1C1F23] shadow-md relative overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-2 pb-2">
            <Activity className="h-5 w-5 text-[#558B2F] dark:text-[#C6FE1E]" />
            <span className="text-sm font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Application Details
            </span>
          </div>
          <div className="flex items-center gap-4">
            {appIcon && appIcon !== "NONE" ? (
              <img src={appIcon} alt={appName} className="w-14 h-14 rounded-lg object-contain" />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xl font-bold text-slate-500 uppercase">
                {appName?.substring(0, 2) || appId.substring(0, 2)}
              </div>
            )}
            <div>
              <h2 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                {appName || appId}
              </h2>
              <Badge variant="outline" className="mt-2 font-mono">ID: {appId}</Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* Content Area */}
      <Card className="border border-slate-200 dark:border-[#2B3036] bg-white dark:bg-[#1C1F23]">
        {viewMode === "graphs" ? (
          <>
            <CardHeader className="flex flex-row items-center justify-between pb-3 flex-wrap gap-4">
              <div>
                <CardTitle className="text-xl font-black text-slate-900 dark:text-slate-100">Usage Analytics</CardTitle>
                <CardDescription className="text-slate-600 dark:text-slate-400 font-medium">Accumulated usage over time</CardDescription>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {/* Timeframe Selector */}
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#111315] p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold">
                  {["today", "week", "month"].map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setTimeframe(tf)}
                      className={`px-3 py-1 rounded-lg transition-all uppercase text-[11px] font-black ${
                        timeframe === tf
                          ? "bg-[#558B2F] dark:bg-[#C6FE1E] text-white dark:text-slate-950 shadow-sm"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>

                {/* Chart Type Selector */}
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#111315] p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold">
                  <button
                    onClick={() => setChartType("bar")}
                    className={`p-1.5 rounded-lg transition-all ${chartType === "bar" ? "bg-white dark:bg-[#1C1F23] shadow-sm text-[#558B2F] dark:text-[#C6FE1E]" : "text-slate-500"}`}
                    title="Bar Chart"
                  >
                    <BarChart3 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setChartType("line")}
                    className={`p-1.5 rounded-lg transition-all ${chartType === "line" ? "bg-white dark:bg-[#1C1F23] shadow-sm text-[#558B2F] dark:text-[#C6FE1E]" : "text-slate-500"}`}
                    title="Line Chart"
                  >
                    <LineChart className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {isLoading ? (
                <div className="h-[400px] flex items-center justify-center text-slate-500 font-semibold animate-pulse">Loading analytics...</div>
              ) : stats.length > 0 ? (
                <div className="h-[400px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    {chartType === "bar" ? (
                      <BarChart data={stats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                        <XAxis dataKey="label" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => formatDuration(val)} />
                        <Tooltip 
                          cursor={{ fill: 'transparent' }}
                          contentStyle={{ backgroundColor: '#1C1F23', borderColor: '#2B3036', borderRadius: '0.75rem', color: '#F8FAFC', fontWeight: 'bold' }}
                          formatter={formatTooltip}
                        />
                        <Bar dataKey="duration_seconds" fill="#65A30D" radius={[4, 4, 0, 0]} className="dark:fill-[#C6FE1E]" />
                      </BarChart>
                    ) : (
                      <RechartsLineChart data={stats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                        <XAxis dataKey="label" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => formatDuration(val)} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1C1F23', borderColor: '#2B3036', borderRadius: '0.75rem', color: '#F8FAFC', fontWeight: 'bold' }}
                          formatter={formatTooltip}
                        />
                        <Line type="monotone" dataKey="duration_seconds" stroke="#65A30D" strokeWidth={3} dot={{ r: 4, fill: "#65A30D" }} activeDot={{ r: 6 }} className="dark:stroke-[#C6FE1E]" />
                      </RechartsLineChart>
                    )}
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[400px] flex items-center justify-center text-slate-500 font-semibold">No usage data for this timeframe.</div>
              )}
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle className="text-xl font-black text-slate-900 dark:text-slate-100">Session History</CardTitle>
              <CardDescription className="text-slate-600 dark:text-slate-400 font-medium">Recent detailed window focuses</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-[400px] flex items-center justify-center text-slate-500 font-semibold animate-pulse">Loading sessions...</div>
              ) : sessions.length > 0 ? (
                <div className="h-[400px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sessions} layout="vertical" margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#334155" opacity={0.2} />
                      <XAxis type="number" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => formatDuration(val)} />
                      <YAxis 
                        dataKey="window_title" 
                        type="category" 
                        stroke="#64748b" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false} 
                        width={120}
                        tickFormatter={(val) => val && val.length > 15 ? val.substring(0, 15) + '...' : val}
                      />
                      <Tooltip 
                        cursor={{ fill: 'transparent' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-white dark:bg-[#1C1F23] border border-slate-200 dark:border-[#2B3036] p-3 rounded-xl shadow-lg font-mono text-xs space-y-1">
                                <p className="font-bold text-slate-900 dark:text-[#F8FAFC] break-words max-w-[250px]">
                                  {data.window_title || "Untitled"}
                                </p>
                                <p className="text-[#558B2F] dark:text-[#C6FE1E] font-black">
                                  Duration: {formatDuration(data.duration_seconds)}
                                </p>
                                <p className="text-slate-500 dark:text-slate-400 font-semibold">
                                  {formatTime(data.started_at)} &rarr; {formatTime(data.ended_at)}
                                </p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="duration_seconds" fill="#65A30D" radius={[0, 4, 4, 0]} className="dark:fill-[#C6FE1E]" barSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[400px] flex items-center justify-center text-slate-500 font-semibold">No session history found.</div>
              )}
            </CardContent>
          </>
        )}
      </Card>
    </div>
  )
}
