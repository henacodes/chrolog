import { useEffect, useState } from "react"
import { Play, Pause, Activity, ShieldCheck, Cpu, BarChart3, RefreshCw, Zap } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { ThemeToggle } from "@/components/ThemeToggle"
import { AppDetails } from "@/components/AppDetails"
import "./style.css"

interface SessionRecord {
  id: number
  app_id: string
  app_name: string
  window_title: string
  source: string
  started_at: string
  ended_at: string
  duration_seconds: number
  metadata?: Record<string, string>
}

interface AppStatRecord {
  app_id: string
  app_name: string
  total_duration_seconds: number
  percentage: number
}

interface AdapterStatusInfo {
  id: string
  active: boolean
}

// Access Wails runtime & Go methods
const wails = (window as any).go?.main?.App
const wailsRuntime = (window as any).runtime

export default function App() {
  const [currentSession, setCurrentSession] = useState<SessionRecord | null>(null)
  const [appStats, setAppStats] = useState<AppStatRecord[]>([])
  const [adapters, setAdapters] = useState<AdapterStatusInfo[]>([])
  const [isPaused, setIsPaused] = useState<boolean>(false)
  const [timeframe, setTimeframe] = useState<string>("today")
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  
  // App Details state
  const [activeAppId, setActiveAppId] = useState<string | null>(null)
  const [activeAppName, setActiveAppName] = useState<string>("")
  const [iconCache, setIconCache] = useState<Record<string, string>>({})

  const fetchData = async () => {
    setIsRefreshing(true)
    try {
      if (wails) {
        const curr = await wails.GetCurrentSession()
        setCurrentSession(curr)

        const stats = await wails.GetCategoryStats(timeframe)
        setAppStats(stats || [])

        const statusList = await wails.GetAdapterStatus()
        setAdapters(statusList || [])

        const paused = await wails.IsPaused()
        setIsPaused(paused)
      } else {
        setMockData()
      }
    } catch (err) {
      console.error("Error fetching backend data:", err)
    } finally {
      setIsRefreshing(false)
    }
  }

  const setMockData = () => {
    setCurrentSession({
      id: 1,
      app_id: "ghostty",
      app_name: "ghostty",
      window_title: "chrolog - internal/adapters/hyprland/hyprland.go",
      source: "hyprland",
      started_at: new Date(Date.now() - 540000).toISOString(),
      ended_at: new Date().toISOString(),
      duration_seconds: 540,
    })
    setAppStats([
      { app_id: "code", app_name: "Visual Studio Code", total_duration_seconds: 3600, percentage: 44.4 },
      { app_id: "firefox", app_name: "firefox", total_duration_seconds: 2700, percentage: 33.3 },
      { app_id: "ghostty", app_name: "ghostty", total_duration_seconds: 1800, percentage: 22.3 },
    ])
    setAdapters([
      { id: "hyprland", active: true },
      { id: "http_listener", active: true },
      { id: "afk", active: true },
    ])
  }

  useEffect(() => {
    fetchData()

    if (wailsRuntime?.EventsOn) {
      const unsubActivity = wailsRuntime.EventsOn("activity:changed", (ev: any) => {
        setCurrentSession((prev) => {
          if (!prev || prev.app_id !== ev.app_id || prev.window_title !== ev.window_title) {
            return {
              id: Date.now(),
              app_id: ev.app_id,
              app_name: ev.app_name,
              window_title: ev.window_title,
              source: ev.source,
              started_at: ev.timestamp,
              ended_at: ev.timestamp,
              duration_seconds: 0,
            }
          }
          return prev
        })
      })

      const unsubSession = wailsRuntime.EventsOn("session:updated", (session: SessionRecord) => {
        setCurrentSession(session)
      })

      return () => {
        unsubActivity && unsubActivity()
        unsubSession && unsubSession()
      }
    } else {
      const interval = setInterval(fetchData, 3000)
      return () => clearInterval(interval)
    }
  }, [timeframe])

  useEffect(() => {
    const fetchIcons = async () => {
      if (wails && appStats.length > 0) {
        const newIcons = { ...iconCache }
        let changed = false
        for (const stat of appStats) {
          // If we haven't attempted to fetch this icon yet (undefined)
          if (newIcons[stat.app_id] === undefined) {
            const b64 = await wails.GetAppIcon(stat.app_id)
            // Cache the base64 string, or "NONE" if not found, to prevent endless retries
            newIcons[stat.app_id] = b64 || "NONE"
            changed = true
          }
        }
        if (changed) setIconCache(newIcons)
      }
    }
    fetchIcons()
  }, [appStats])

  const handleToggleTracking = async () => {
    if (wails) {
      const active = await wails.ToggleTracking()
      setIsPaused(!active)
    } else {
      setIsPaused(!isPaused)
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
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    } catch {
      return ""
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-[#111315] text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-150 selection:bg-[#C6FE1E] selection:text-black">
      {/* Main App Container */}
      <div className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Top Navbar */}
        <header className="rounded-2xl p-5 border border-slate-200 dark:border-[#2B3036] bg-white dark:bg-[#1C1F23] flex flex-wrap items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-2xl bg-[#558B2F] dark:bg-[#C6FE1E] text-white dark:text-slate-950 flex items-center justify-center shadow-md">
              <Zap className="h-6 w-6 fill-current" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                CHROLOG
                <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-[#C6FE1E]/20 text-emerald-800 dark:text-[#C6FE1E] border border-emerald-200 dark:border-[#C6FE1E]/40 uppercase tracking-widest">
                  Overview
                </span>
              </h1>
              <p className="text-xs font-bold text-slate-600 dark:text-slate-400">
                Modern Decoupled Time Tracker &bull; High Contrast Theme
              </p>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Adapter Indicators */}
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#111315] border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300">
              <Cpu className="h-3.5 w-3.5 text-[#558B2F] dark:text-[#C6FE1E]" />
              <span>Adapters:</span>
              {adapters.map((a) => (
                <Badge key={a.id} variant="secondary" className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-md">
                  {a.id}
                </Badge>
              ))}
            </div>

            <ThemeToggle />

            <Button
              variant={isPaused ? "destructive" : "default"}
              size="sm"
              onClick={handleToggleTracking}
              className="gap-2 shadow-sm uppercase tracking-wider font-black text-xs rounded-xl"
            >
              {isPaused ? <Play className="h-4 w-4 fill-current" /> : <Pause className="h-4 w-4 fill-current" />}
              {isPaused ? "Resume" : "Pause"}
            </Button>

            <Button variant="outline" size="icon" onClick={fetchData} disabled={isRefreshing} className="h-9 w-9 rounded-xl">
              <RefreshCw className={`h-4 w-4 text-slate-700 dark:text-slate-300 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </header>

        {activeAppId ? (
          <AppDetails appId={activeAppId} appName={activeAppName} appIcon={iconCache[activeAppId]} onBack={() => setActiveAppId(null)} />
        ) : (
          <div className="space-y-6">
            {/* Hero Active Focus Card */}
            <Card className="border border-slate-200 dark:border-[#2B3036] bg-white dark:bg-[#1C1F23] shadow-md relative overflow-hidden">
              <div className="p-6">
                <div className="flex items-center justify-between pb-3">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-[#558B2F] dark:text-[#C6FE1E]" />
                    <span className="text-xs font-black uppercase tracking-widest text-[#558B2F] dark:text-[#C6FE1E]">
                      Current Active Focus
                    </span>
                  </div>
                  <Badge variant={isPaused ? "destructive" : "lime"} className="flex items-center gap-1.5 px-3 py-1 rounded-full">
                    <span className={`h-2 w-2 rounded-full ${isPaused ? "bg-slate-400" : "bg-[#558B2F] dark:bg-[#C6FE1E] animate-pulse"}`} />
                    {isPaused ? "Paused" : "Live Streaming"}
                  </Badge>
                </div>

                <div className="space-y-4">
                  <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                    {currentSession ? currentSession.app_name || currentSession.app_id : "No Active Window"}
                  </h2>

                  <div className="p-4 rounded-xl bg-slate-100 dark:bg-[#111315] border border-slate-200 dark:border-slate-800 font-mono text-sm text-slate-900 dark:text-slate-100 truncate shadow-inner">
                    {currentSession?.window_title || "Untitled Focus State"}
                  </div>

                  <div className="flex flex-wrap items-end justify-between gap-4 pt-3 border-t border-slate-200 dark:border-slate-800">
                    <div>
                      <div className="text-xs font-black uppercase text-slate-500 dark:text-slate-400">Duration Elapsed</div>
                      <div className="text-4xl sm:text-5xl font-black text-[#558B2F] dark:text-[#C6FE1E] font-mono tracking-tight mt-1">
                        {formatDuration(currentSession?.duration_seconds || 0)}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-xs font-mono uppercase rounded-lg">
                        Source: {currentSession?.source || "None"}
                      </Badge>
                      {currentSession?.started_at && (
                        <Badge variant="outline" className="text-xs font-mono rounded-lg">
                          Started {formatTime(currentSession.started_at)}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Application Usage Breakdown Card */}
            <Card className="border border-slate-200 dark:border-[#2B3036] bg-white dark:bg-[#1C1F23]">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-lg font-black flex items-center gap-2 text-slate-900 dark:text-slate-100">
                    <BarChart3 className="h-5 w-5 text-[#558B2F] dark:text-[#C6FE1E]" />
                    Usage Overview
                  </CardTitle>
                  <CardDescription className="text-slate-600 dark:text-slate-400 font-medium">Click an app to view detailed statistics</CardDescription>
                </div>

                {/* Timeframe Selector */}
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#111315] p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold">
                  {["today", "24h", "7d"].map((tf) => (
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
              </CardHeader>

              <CardContent className="space-y-4">
                {appStats.length > 0 ? (
                  appStats.map((stat) => (
                    <div 
                      key={stat.app_id} 
                      className="space-y-2 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                      onClick={() => {
                        setActiveAppId(stat.app_id)
                        setActiveAppName(stat.app_name || stat.app_id)
                      }}
                    >
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-3">
                          {iconCache[stat.app_id] && iconCache[stat.app_id] !== "NONE" ? (
                            <img src={iconCache[stat.app_id]} alt={stat.app_name} className="w-5 h-5 rounded-sm object-contain" />
                          ) : (
                            <div className="w-5 h-5 rounded-sm bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[9px] font-bold text-slate-500 uppercase">
                              {stat.app_name?.substring(0, 2) || stat.app_id.substring(0, 2)}
                            </div>
                          )}
                          <span className="font-bold text-slate-900 dark:text-slate-100 truncate max-w-[200px] sm:max-w-[300px]">
                            {stat.app_name || stat.app_id}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs font-mono">
                          <span className="text-slate-600 dark:text-slate-400 font-semibold">{formatDuration(stat.total_duration_seconds)}</span>
                          <span className="font-black text-[#558B2F] dark:text-[#C6FE1E] w-12 text-right">
                            {stat.percentage.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      <Progress value={stat.percentage} />
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 text-slate-500 dark:text-slate-400 text-sm font-semibold">
                    No activity recorded for this timeframe yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-auto py-6 bg-white dark:bg-[#1C1F23] border-t border-slate-200 dark:border-[#2B3036]">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center justify-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[#558B2F] dark:text-[#C6FE1E]" />
          <span>Chrolog Time Tracker &bull; 100% Local Privacy &bull; High-Contrast Dashboard</span>
        </div>
      </footer>
    </div>
  )
}
