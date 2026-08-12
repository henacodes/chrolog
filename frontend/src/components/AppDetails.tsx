import { useEffect, useState } from "react"
import { ArrowLeft, BarChart3, LineChart, History, Activity, CalendarIcon } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { format, parseISO } from "date-fns"
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
import { GithubHeatmap } from "./GithubHeatmap"

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

  // Session specific state
  const [sessionDates, setSessionDates] = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [sessionHours, setSessionHours] = useState<number[]>([])
  const [selectedHour, setSelectedHour] = useState<number | null>(null)

  // 1. Fetch Graphs Data
  useEffect(() => {
    if (viewMode === "graphs") {
      const fetchGraphs = async () => {
        setIsLoading(true)
        try {
          if (wails) {
            const res = await wails.GetAppUsageStats(appId, timeframe)
            setStats(res || [])
          }
        } catch (err) {
          console.error("Error fetching graphs:", err)
        } finally {
          setIsLoading(false)
        }
      }
      fetchGraphs()
    }
  }, [appId, timeframe, viewMode])

  // 2. Fetch Session Dates
  useEffect(() => {
    if (viewMode === "sessions" && wails) {
      const initSessions = async () => {
        try {
          const dates = await wails.GetActiveSessionDates(appId)
          setSessionDates(dates || [])
          if (dates && dates.length > 0) {
            if (!selectedDate || !dates.includes(selectedDate)) {
               setSelectedDate(dates[0])
            }
          } else {
             setSessions([])
             setSessionHours([])
             setSelectedDate(null)
             setSelectedHour(null)
          }
        } catch (e) {
          console.error("Error fetching session dates:", e)
        }
      }
      initSessions()
    }
  }, [viewMode, appId]) // Intentional: we only want this to run when mode/app changes

  // 3. Fetch Session Hours when Date changes
  useEffect(() => {
    if (viewMode === "sessions" && selectedDate && wails) {
      const fetchHours = async () => {
        try {
          const hours = await wails.GetActiveSessionHours(appId, selectedDate)
          setSessionHours(hours || [])
          if (hours && hours.length > 0) {
             if (selectedHour === null || !hours.includes(selectedHour)) {
               setSelectedHour(hours[0])
             }
          } else {
            setSelectedHour(null)
            setSessions([])
          }
        } catch (e) {
          console.error("Error fetching session hours:", e)
        }
      }
      fetchHours()
    }
  }, [selectedDate, viewMode, appId])

  // 4. Fetch Sessions by time
  useEffect(() => {
    if (viewMode === "sessions" && selectedDate && selectedHour !== null && wails) {
      const fetchSessions = async () => {
        setIsLoading(true)
        try {
          const data = await wails.GetAppSessionsByTime(appId, selectedDate, selectedHour)
          setSessions(data || [])
        } catch (e) {
          console.error("Error fetching sessions by time:", e)
        } finally {
          setIsLoading(false)
        }
      }
      fetchSessions()
    }
  }, [selectedHour, selectedDate, viewMode, appId])

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

  const formatTooltip = (value: any): any[] => {
    return [formatDuration(Number(value)), "Duration"]
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button variant="outline" onClick={onBack} className="gap-2 rounded-none">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Button>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-background p-1 rounded-none border border-slate-200 dark:border-slate-800 text-xs font-bold">
            <button
              onClick={() => setViewMode("graphs")}
              className={`px-3 py-1.5 rounded-none transition-all flex items-center gap-1.5 ${
                viewMode === "graphs"
                  ? "bg-card text-slate-900 dark:text-slate-100 shadow-none"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
            >
              <BarChart3 className="h-4 w-4" /> Graphs
            </button>
            <button
              onClick={() => setViewMode("sessions")}
              className={`px-3 py-1.5 rounded-none transition-all flex items-center gap-1.5 ${
                viewMode === "sessions"
                  ? "bg-card text-slate-900 dark:text-slate-100 shadow-none"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
            >
              <History className="h-4 w-4" /> Sessions
            </button>
          </div>
        </div>
      </div>

      {/* App Header Info */}
      <Card className="border border-border bg-card shadow-none relative overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-2 pb-2">
            <Activity className="h-5 w-5 text-[#558B2F] dark:text-primary" />
            <span className="text-sm font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Application Details
            </span>
          </div>
          <div className="flex items-center gap-4">
            {appIcon && appIcon !== "NONE" ? (
              <img src={appIcon} alt={appName} className="w-14 h-14 rounded-none object-contain" />
            ) : (
              <div className="w-14 h-14 rounded-none bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xl font-bold text-slate-500 uppercase">
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
      <Card className="border border-border bg-card">
        {viewMode === "graphs" ? (
          <>
            <CardHeader className="flex flex-row items-center justify-between pb-3 flex-wrap gap-4">
              <div>
                <CardTitle className="text-xl font-black text-slate-900 dark:text-slate-100">Usage Analytics</CardTitle>
                <CardDescription className="text-slate-600 dark:text-slate-400 font-medium">Accumulated usage over time</CardDescription>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {/* Timeframe Selector */}
                <div className="flex items-center gap-1 bg-background p-1 rounded-none border border-slate-200 dark:border-slate-800 text-xs font-bold">
                  {["today", "week", "month"].map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setTimeframe(tf)}
                      className={`px-3 py-1 rounded-none transition-all uppercase text-[11px] font-black ${
                        timeframe === tf
                          ? "bg-[#558B2F] dark:bg-primary text-white dark:text-slate-950 shadow-none"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>

                {/* Chart Type Selector */}
                <div className="flex items-center gap-1 bg-background p-1 rounded-none border border-slate-200 dark:border-slate-800 text-xs font-bold">
                  <button
                    onClick={() => setChartType("bar")}
                    className={`p-1.5 rounded-none transition-all ${chartType === "bar" ? "bg-card shadow-none text-[#558B2F] dark:text-primary" : "text-slate-500"}`}
                    title="Bar Chart"
                  >
                    <BarChart3 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setChartType("line")}
                    className={`p-1.5 rounded-none transition-all ${chartType === "line" ? "bg-card shadow-none text-[#558B2F] dark:text-primary" : "text-slate-500"}`}
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
                        <Bar dataKey="duration_seconds" fill="var(--primary)" radius={[4, 4, 0, 0]} />
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
                        <Line type="monotone" dataKey="duration_seconds" stroke="var(--primary)" strokeWidth={3} dot={{ r: 4, fill: "var(--primary)" }} activeDot={{ r: 6 }} />
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
            <CardHeader className="flex flex-row items-center justify-between pb-3 flex-wrap gap-4">
              <div>
                <CardTitle className="text-xl font-black text-slate-900 dark:text-slate-100">Session History</CardTitle>
                <CardDescription className="text-slate-600 dark:text-slate-400 font-medium">Detailed window focuses by hour</CardDescription>
              </div>
              
              <div className="flex items-center gap-2 flex-wrap">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={`w-[180px] justify-start text-left font-bold rounded-none border-slate-200 dark:border-slate-800 ${!selectedDate && "text-muted-foreground"}`}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDate ? format(parseISO(selectedDate), "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 rounded-none border-border" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedDate ? parseISO(selectedDate) : undefined}
                      onSelect={(date) => {
                        if (date) {
                          setSelectedDate(format(date, 'yyyy-MM-dd'))
                        }
                      }}
                      disabled={(date) => {
                        const dateStr = format(date, 'yyyy-MM-dd')
                        return !sessionDates.includes(dateStr)
                      }}
                    />
                  </PopoverContent>
                </Popover>

                <Select
                  value={selectedHour !== null ? selectedHour.toString() : ""}
                  onValueChange={(val) => setSelectedHour(parseInt(val))}
                  disabled={!selectedDate || sessionHours.length === 0}
                >
                  <SelectTrigger className="w-[100px] font-bold rounded-none border-slate-200 dark:border-slate-800">
                    <SelectValue placeholder="Time" />
                  </SelectTrigger>
                  <SelectContent>
                    {sessionHours.length === 0 && <SelectItem value="none" disabled>-</SelectItem>}
                    {sessionHours.map(h => (
                      <SelectItem key={h} value={h.toString()} className="font-bold">
                        {h.toString().padStart(2, '0')}:00
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                              <div className="bg-card border border-border p-3 rounded-none shadow-none font-mono text-xs space-y-1">
                                <p className="font-bold text-slate-900 dark:text-[#F8FAFC] break-words max-w-[250px]">
                                  {data.window_title || "Untitled"}
                                </p>
                                <p className="text-[#558B2F] dark:text-primary font-black">
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
                      <Bar dataKey="duration_seconds" fill="var(--primary)" radius={[0, 4, 4, 0]} barSize={20} />
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
      
      {/* Github Heatmap */}
      <GithubHeatmap appId={appId} appName={appName} />
    </div>
  )
}
