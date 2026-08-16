import { useEffect, useState, useMemo } from "react"
import { Play, Pause, Activity, ShieldCheck, Cpu, BarChart3, RefreshCw, Zap, AppWindow, LineChart as LineChartIcon, Globe, PlayCircle, PauseCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { ThemeToggle } from "@/components/ThemeToggle"
import { AppDetails } from "@/components/AppDetails"
import { IcicleChart, IcicleNode } from "@/components/d3/IcicleChart"
import { MultiLineChart, LineSeriesData } from "@/components/d3/MultiLineChart"
import { format, parseISO } from "date-fns"
import "./style.css"

const COLORS = [
  '#609fa5', // Soft Teal
  '#d1b96e', // Soft Mustard
  '#b55c5a', // Soft Red
  '#e5ddc5', // Soft Warm Gray
  '#445a6f', // Soft Navy
];

const LanguageIcon = ({ language }: { language: string }) => {
  const [error, setError] = useState(false);
  if (!language) return null;
  
  let lang = language.toLowerCase();
  if (lang === 'ts') lang = 'typescript';
  if (lang === 'js') lang = 'javascript';
  if (lang === 'cpp') lang = 'cplusplus';
  if (lang === 'cs') lang = 'csharp';
  if (lang === 'py') lang = 'python';
  if (lang === 'rs') lang = 'rust';
  
  if (error) {
    return <div className="w-4 h-4 flex items-center justify-center bg-slate-200 dark:bg-slate-700 text-[8px] font-medium text-slate-500 uppercase">{language.substring(0, 2)}</div>;
  }
  
  return (
    <img 
      src={`https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/${lang}/${lang}-original.svg`}
      className="w-4 h-4 object-contain"
      onError={() => setError(true)}
      alt={language}
      title={language}
    />
  );
};

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

interface AppUsageStat {
  label: string
  duration_seconds: number
  url?: string
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
  const [refreshKey, setRefreshKey] = useState<number>(0)
  const [trendStats, setTrendStats] = useState<AppUsageStat[]>([])

  // App Details state
  const [activeAppId, setActiveAppId] = useState<string | null>(null)
  const [activeAppName, setActiveAppName] = useState<string>("")
  const [iconCache, setIconCache] = useState<Record<string, string>>({})

  const globalIcicleData = useMemo<IcicleNode>(() => {
    return {
      name: "All Activity",
      children: appStats.map((stat) => ({
        name: stat.app_name || stat.app_id,
        value: stat.total_duration_seconds,
      })),
    }
  }, [appStats])

  const fetchData = async () => {
    setIsRefreshing(true)
    setRefreshKey(prev => prev + 1)
    try {
      if (wails) {
        const curr = await wails.GetCurrentSession()
        setCurrentSession(curr)

        const stats = await wails.GetCategoryStats(timeframe)
        setAppStats(stats || [])

        const trend = await wails.GetGlobalTrendStats(7)
        setTrendStats(trend || [])

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
    setTrendStats([
      { label: new Date(Date.now() - 6*86400000).toISOString(), duration_seconds: 14400 },
      { label: new Date(Date.now() - 5*86400000).toISOString(), duration_seconds: 18000 },
      { label: new Date(Date.now() - 4*86400000).toISOString(), duration_seconds: 10800 },
      { label: new Date(Date.now() - 3*86400000).toISOString(), duration_seconds: 21600 },
      { label: new Date(Date.now() - 2*86400000).toISOString(), duration_seconds: 15300 },
      { label: new Date(Date.now() - 1*86400000).toISOString(), duration_seconds: 9000 },
      { label: new Date().toISOString(), duration_seconds: 12600 },
    ])
    setAdapters([
      { id: "hyprland", active: true },
      { id: "http_listener", active: true },
      { id: "afk", active: true },
    ])
  }

  useEffect(() => {
    fetchData()

    let unsubActivity: any = null
    let unsubSession: any = null

    if (wailsRuntime?.EventsOn) {
      unsubActivity = wailsRuntime.EventsOn("activity:changed", (ev: any) => {
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
              metadata: ev.metadata || {},
            }
          }
          // Always update metadata in case it changed without window title changing
          if (ev.metadata && prev.metadata !== ev.metadata) {
            return { ...prev, metadata: ev.metadata }
          }
          return prev
        })
      })

      unsubSession = wailsRuntime.EventsOn("session:updated", (session: SessionRecord) => {
        setCurrentSession(session)
      })
    }

    return () => {
      if (unsubActivity) unsubActivity()
      if (unsubSession) unsubSession()
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
    <div className="min-h-screen bg-background text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-150 selection:bg-primary selection:text-black">
      {/* Main App Container */}
      <div className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Top Navbar */}
        <header className="flex flex-wrap items-center justify-between gap-4 py-2">
          <div className="flex items-center gap-3.5">
            <div>
              <h1 className="text-2xl font-medium tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Zap className="h-6 w-6 text-primary" />
                Chrolog
              </h1>
              <p className="text-sm font-normal text-slate-500 dark:text-slate-400">
                Your daily time overview
              </p>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Adapter Indicators */}
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-background border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300">
              <Cpu className="h-3.5 w-3.5 text-primary dark:text-primary" />
              <span>Adapters:</span>
              {adapters.map((a) => (
                <Badge key={a.id} variant="secondary" className="text-[10px] uppercase  px-2 py-0.5 rounded-xl">
                  {a.id}
                </Badge>
              ))}
            </div>

            <ThemeToggle />

            <Button
              variant={isPaused ? "destructive" : "default"}
              size="sm"
              onClick={handleToggleTracking}
              className="gap-2 shadow-none font-medium text-xs rounded-xl"
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
          <AppDetails appId={activeAppId} appName={activeAppName} appIcon={iconCache[activeAppId]} refreshKey={refreshKey} onBack={() => setActiveAppId(null)} />
        ) : (
          <div className="space-y-6">
            {/* Hero Active Focus Card */}
            <Card className="border border-border bg-card shadow-none relative overflow-hidden">
              <div className="p-6">
                <div className="flex items-center justify-between pb-3">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary dark:text-primary" />
                    <span className="text-xs font-medium uppercase tracking-widest text-primary dark:text-primary">
                      Current Active Focus
                    </span>
                  </div>
                  <Badge variant={isPaused ? "destructive" : "lime"} className="flex items-center gap-1.5 px-3 py-1 rounded-xl">
                    <span className={`h-2 w-2 rounded-xl ${isPaused ? "bg-slate-400" : "bg-primary dark:bg-primary animate-pulse"}`} />
                    <span className="leading-none pt-[1px]">{isPaused ? "Paused" : "Live Streaming"}</span>
                  </Badge>
                </div>

                <div className="space-y-4">
                  <h2 className="text-2xl sm:text-3xl font-medium text-slate-900 dark:text-slate-100 tracking-tight">
                    {currentSession ? currentSession.app_name || currentSession.app_id : "No Active Window"}
                  </h2>

                  <div className="p-4 rounded-xl bg-background border border-slate-200 dark:border-slate-800  text-sm text-slate-900 dark:text-slate-100 truncate shadow-none">
                    {currentSession?.window_title || "Untitled Focus State"}
                  </div>
                  
                  {/* Metadata Rich UI */}
                  {currentSession?.metadata && (
                    <div className="flex flex-col gap-3 pt-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {currentSession.metadata.category && (
                          <Badge variant="secondary" className="text-xs uppercase font-medium px-2 py-1 rounded-xl">
                            {currentSession.metadata.category}
                          </Badge>
                        )}

                        {/* IDE-style: project / document */}
                        {currentSession.metadata.project && currentSession.metadata.document && (
                          <div className="flex items-center gap-2 px-3 py-1.5 border border-border bg-secondary/50 rounded-xl shadow-sm">
                            {currentSession.metadata.language && (
                              <LanguageIcon language={currentSession.metadata.language} />
                            )}
                            <span className="text-xs font-medium text-slate-900 dark:text-slate-100">
                              {currentSession.metadata.project}
                              <span className="text-slate-400 dark:text-slate-500 mx-1.5">/</span>
                              <span className=" text-primary dark:text-primary">{currentSession.metadata.document}</span>
                            </span>
                          </div>
                        )}

                        {/* Browser-style: domain badge + page title (shown when parser finds project but no doc) */}
                        {currentSession.metadata.project && !currentSession.metadata.document && (
                          <div className="flex items-center gap-2 px-3 py-1.5 border border-primary/20 bg-primary/5 rounded-xl shadow-sm max-w-md">
                            <Globe className="h-3 w-3 text-blue-500 dark:text-blue-400 shrink-0" />
                            <span className="text-[10px] font-medium uppercase tracking-widest text-blue-600 dark:text-blue-400 shrink-0">
                              {currentSession.metadata.project}
                            </span>
                            {currentSession.window_title && (
                              <>
                                <span className="text-blue-300 dark:text-blue-700 shrink-0">·</span>
                                <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                                  {currentSession.window_title.replace(/\s*-\s*[^-]+$/,'').replace(/\s*-\s*[^-]+$/,'').trim() || currentSession.window_title}
                                </span>
                              </>
                            )}
                          </div>
                        )}
                        
                        {(() => {
                          if (!currentSession.metadata.platform_specific) return null;
                          try {
                            const platform = JSON.parse(currentSession.metadata.platform_specific);
                            if (platform.youtube) {
                              const yt = platform.youtube;
                              const formatTime = (secs: number) => {
                                const m = Math.floor(secs / 60);
                                const s = secs % 60;
                                return `${m}:${s.toString().padStart(2, '0')}`;
                              };
                              return (
                                <Badge variant="outline" className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-xl border ${yt.is_playing ? 'border-destructive/30 text-destructive bg-destructive/10' : 'border-border text-muted-foreground'}`}>
                                  {yt.is_playing
                                    ? <PlayCircle className="h-3 w-3" />
                                    : <PauseCircle className="h-3 w-3" />}
                                  <span>{yt.is_playing ? 'PLAYING' : 'PAUSED'}</span>
                                  {yt.current_time_seconds > 0 && <span>• {formatTime(yt.current_time_seconds)}</span>}
                                  {yt.channel_name && <span>• {yt.channel_name}</span>}
                                </Badge>
                              );
                            }
                          } catch (e) {
                            return null;
                          }
                          return null;
                        })()}
                      </div>
                      
                      {/* Description and Site info */}
                      {(currentSession.metadata.site_name || currentSession.metadata.description) && (
                        <div className="text-sm text-slate-600 dark:text-slate-400 border-l-2 border-primary/40 pl-4 py-1 mt-2">
                          {currentSession.metadata.site_name && (
                            <div className="font-medium text-slate-800 dark:text-slate-200 mb-1 tracking-tight">
                              {currentSession.metadata.site_name}
                            </div>
                          )}
                          {currentSession.metadata.description && (
                            <div className="line-clamp-2 leading-relaxed opacity-90 text-[13px]">
                              {currentSession.metadata.description}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-end justify-between gap-4 pt-3 border-t border-slate-200 dark:border-slate-800">
                    <div>
                      <div className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Duration Elapsed</div>
                      <div className="text-4xl sm:text-5xl font-medium text-primary dark:text-primary  tracking-tight mt-1">
                        {formatDuration(currentSession?.duration_seconds || 0)}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-xs  uppercase rounded-xl">
                        Source: {currentSession?.source || "None"}
                      </Badge>
                      {currentSession?.started_at && (
                        <Badge variant="outline" className="text-xs  rounded-xl">
                          Started {formatTime(currentSession.started_at)}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Application Usage Breakdown Card */}
            <Card className="border border-border bg-card">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-lg font-medium flex items-center gap-2 text-slate-900 dark:text-slate-100">
                    <BarChart3 className="h-5 w-5 text-primary dark:text-primary" />
                    Usage Overview
                  </CardTitle>
                  <CardDescription className="text-slate-600 dark:text-slate-400 font-medium">Click an app to view detailed statistics</CardDescription>
                </div>

                {/* Timeframe Selector */}
                <div className="flex items-center gap-1 bg-background p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium">
                  {["today", "24h", "7d"].map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setTimeframe(tf)}
                      className={`px-3 py-1 rounded-xl transition-all uppercase text-[11px] font-medium ${timeframe === tf
                        ? "bg-primary dark:bg-primary text-white dark:text-slate-950 shadow-none"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                        }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {(() => {
                  let liveStats = [...appStats].map(s => ({ ...s }))
                  let activeAppFound = false

                  if (currentSession && currentSession.duration_seconds > 0) {
                    for (let i = 0; i < liveStats.length; i++) {
                      if (liveStats[i].app_id === currentSession.app_id) {
                        liveStats[i].total_duration_seconds += currentSession.duration_seconds
                        activeAppFound = true
                        break
                      }
                    }

                    if (!activeAppFound) {
                      liveStats.push({
                        app_id: currentSession.app_id,
                        app_name: currentSession.app_name,
                        total_duration_seconds: currentSession.duration_seconds,
                        percentage: 0
                      })
                    }

                    const total = liveStats.reduce((acc, curr) => acc + curr.total_duration_seconds, 0)
                    liveStats.forEach(stat => {
                      stat.percentage = total > 0 ? (stat.total_duration_seconds / total) * 100 : 0
                    })
                    liveStats.sort((a, b) => b.total_duration_seconds - a.total_duration_seconds)
                  }
                  return liveStats
                })().length > 0 ? (
                  (() => {
                    let liveStats = [...appStats].map(s => ({ ...s }))
                    let activeAppFound = false

                    if (currentSession && currentSession.duration_seconds > 0) {
                      for (let i = 0; i < liveStats.length; i++) {
                        if (liveStats[i].app_id === currentSession.app_id) {
                          liveStats[i].total_duration_seconds += currentSession.duration_seconds
                          activeAppFound = true
                          break
                        }
                      }

                      if (!activeAppFound) {
                        liveStats.push({
                          app_id: currentSession.app_id,
                          app_name: currentSession.app_name,
                          total_duration_seconds: currentSession.duration_seconds,
                          percentage: 0
                        })
                      }

                      const total = liveStats.reduce((acc, curr) => acc + curr.total_duration_seconds, 0)
                      liveStats.forEach(stat => {
                        stat.percentage = total > 0 ? (stat.total_duration_seconds / total) * 100 : 0
                      })
                      liveStats.sort((a, b) => b.total_duration_seconds - a.total_duration_seconds)
                    }

                    return liveStats.map((stat) => (
                      <div
                        key={stat.app_id}
                        className="space-y-2 p-3 rounded-xl hover:bg-accent/50 transition-colors cursor-pointer border border-transparent hover:border-border"
                        onClick={() => {
                          setActiveAppId(stat.app_id)
                          setActiveAppName(stat.app_name || stat.app_id)
                        }}
                      >
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-3">
                            {iconCache[stat.app_id] && iconCache[stat.app_id] !== "NONE" ? (
                              <img src={iconCache[stat.app_id]} alt={stat.app_name} className="w-5 h-5 rounded-xl object-contain" />
                            ) : (
                              <div className="w-5 h-5 flex items-center justify-center text-slate-400 dark:text-slate-500">
                                <AppWindow className="w-4 h-4" />
                              </div>
                            )}
                            <span className="font-medium text-slate-900 dark:text-slate-100 truncate max-w-[200px] sm:max-w-[300px]">
                              {stat.app_name || stat.app_id}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs ">
                            <span className="text-slate-600 dark:text-slate-400 font-semibold">{formatDuration(stat.total_duration_seconds)}</span>
                            <span className="font-medium text-primary dark:text-primary w-12 text-right">
                              {stat.percentage.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <Progress value={stat.percentage} />
                      </div>
                    ))
                  })()
                ) : (
                  <div className="text-center py-10 text-slate-500 dark:text-slate-400 text-sm font-semibold">
                    No activity recorded for this timeframe yet.
                  </div>
                )}
              </CardContent>
            </Card>
            {/* Global Analytics Section with D3 */}
            <div className="space-y-6">
              {/* D3 MultiLineChart: Usage Trend Comparison */}
              {trendStats.length > 0 && (
                <MultiLineChart
                  title="Daily Usage Trend"
                  subtitle="Tracked duration over time grouped by day"
                  height={260}
                  formatValue={formatDuration}
                  series={[
                    {
                      id: "total_tracked",
                      name: "Total Active Focus",
                      color: "#257a82",
                      values: trendStats.map((t) => ({
                        date: t.label,
                        value: t.duration_seconds,
                      })),
                    },
                  ]}
                />
              )}

              {/* D3 Icicle Chart: App Hierarchy Breakdown */}
              {appStats.length > 0 && (
                <Card className="border border-border bg-card">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-medium flex items-center gap-2 text-slate-900 dark:text-slate-100">
                      <BarChart3 className="h-5 w-5 text-primary dark:text-primary" />
                      App Composition Hierarchy (Flame Graph)
                    </CardTitle>
                    <CardDescription className="text-slate-600 dark:text-slate-400 font-medium">
                      Click any block to zoom into hierarchical activity
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <IcicleChart
                      height={240}
                      formatValue={formatDuration}
                      data={globalIcicleData}
                    />
                  </CardContent>
                </Card>
              )}
            </div>

          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-auto py-6 bg-card border-t border-border">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center justify-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary dark:text-primary" />
          <span>Chrolog Time Tracker &bull; 100% Local Privacy</span>
        </div>
      </footer>
    </div>
  )
}
