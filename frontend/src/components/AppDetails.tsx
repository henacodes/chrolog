import { useEffect, useState, useMemo } from "react"
import { ArrowLeft, BarChart3, History, Activity, CalendarIcon, ChevronRight, ChevronDown, AppWindow } from "lucide-react"
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
import { IcicleChart, IcicleNode } from "@/components/d3/IcicleChart"
import { MultiLineChart } from "@/components/d3/MultiLineChart"

import { GithubHeatmap } from "./GithubHeatmap"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { DocumentTimeline } from "./DocumentTimeline"

function getDocumentIcon(appId: string, label: string, url?: string, language?: string, project?: string): string | null {
  // If the appId is a hostname (e.g. from our new browser extension), fetch its specific favicon
  if (appId.includes('.') && !appId.includes(' ')) {
    return `https://www.google.com/s2/favicons?domain=${appId}&sz=32`
  }

  // If this is the OS tracker for a browser, and we have a URL, extract the hostname
  const browserApps = ['google-chrome', 'msedge', 'brave-browser', 'browser', 'firefox', 'safari']
  if (browserApps.includes(appId.toLowerCase())) {
    if (url) {
      try {
        const hostname = new URL(url).hostname
        return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`
      } catch (e) {
        // Invalid URL, fall back
      }
    } else {
      let domain = project || ''
      if (!domain) {
        const lower = label.toLowerCase()
        if (lower.includes('youtube')) domain = 'youtube.com'
        else if (lower.includes('github')) domain = 'github.com'
        else if (lower.includes('google search')) domain = 'google.com'
        else if (lower.includes('gmail')) domain = 'mail.google.com'
        else if (lower.includes('meet -')) domain = 'meet.google.com'
        else if (lower.includes('gemini') || lower.includes('chatgpt')) domain = 'chat.openai.com' // Using chatgpt icon for AI chats as a fallback if not gemini
        else if (lower.includes('stackoverflow') || lower.includes('stack overflow')) domain = 'stackoverflow.com'
        else if (lower.includes('notion')) domain = 'notion.so'
        else if (lower.includes('figma')) domain = 'figma.com'
        else if (lower.includes('twitter') || lower.includes('x.com')) domain = 'x.com'
        else if (lower.includes('reddit')) domain = 'reddit.com'
        else if (lower.includes('localhost') || lower.includes('127.0.0.1')) domain = 'localhost'
        
        // Specifically for Gemini
        if (lower.includes('gemini')) domain = 'gemini.google.com'
      }

      if (domain) {
        return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
      }
      
      // If we can't guess, fallback to a generic web icon
      return 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/chrome/chrome-original.svg'
    }
  }

  // If this is a code editor, return the language icon based on the file extension
  const codeEditors = ['code', 'cursor', 'webstorm', 'intellij', 'goland', 'pycharm', 'zed', 'antigravity']
  if (codeEditors.some(editor => appId.toLowerCase().includes(editor))) {
    const l = label.toLowerCase()
    
    // Check file extensions first
    if (l.endsWith('.tsx') || l.endsWith('.ts')) return 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg'
    if (l.endsWith('.jsx') || l.endsWith('.js')) return 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg'
    if (l.endsWith('.go')) return 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/go/go-original.svg'
    if (l.endsWith('.py')) return 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg'
    if (l.endsWith('.rs')) return 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/rust/rust-plain.svg'
    if (l.endsWith('.css')) return 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/css3/css3-original.svg'
    if (l.endsWith('.html')) return 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/html5/html5-original.svg'
    if (l.endsWith('.json')) return 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/json/json-original.svg'
    if (l.endsWith('.md')) return 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/markdown/markdown-original.svg'
    
    // If no extension matches but we have a language string from extension
    if (language) {
      let lang = language.toLowerCase();
      if (lang.includes('typescript') || lang === 'ts') return 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg'
      if (lang.includes('javascript') || lang === 'js') return 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg'
      if (lang === 'go') return 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/go/go-original.svg'
      if (lang === 'python') return 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg'
      if (lang === 'rust') return 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/rust/rust-plain.svg'
      if (lang === 'cpp' || lang === 'c++') return 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/cplusplus/cplusplus-original.svg'
      if (lang === 'csharp' || lang === 'c#') return 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/csharp/csharp-original.svg'
      if (lang === 'java') return 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg'
      if (lang === 'ruby') return 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/ruby/ruby-original.svg'
      if (lang === 'php') return 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/php/php-original.svg'
    }
    
    // For projects (which don't have extensions), we return null so the accordion renders a Folder icon
    return null
  }

  return null
}

interface AppDetailsProps {
  appId: string
  appName: string
  appIcon?: string
  refreshKey?: number
  onBack: () => void
}

interface AppUsageStat {
  label: string
  duration_seconds: number
  url?: string
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
  metadata?: Record<string, string>
}

// Custom Accordion UI for Content Breakdown
function AccordionItem({ group, appId, maxDuration, formatDuration, onSelectDocument }: { group: any, appId: string, maxDuration: number, formatDuration: (s: number) => string, onSelectDocument: (doc: any) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  
  // Try to fetch icon for the project level
  const iconUrl = getDocumentIcon(appId, group.project)
  
  const widthPercent = maxDuration > 0 ? (group.totalDuration / maxDuration) * 100 : 0
  const hasChildren = group.items.length > 0

  return (
    <div className="flex flex-col mb-2 bg-slate-50 dark:bg-slate-800/20 border border-slate-200 dark:border-slate-800 rounded-none overflow-hidden transition-all">
      {/* Header / Parent */}
      <div 
        className={`relative flex items-center justify-between p-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/40 z-10 ${isOpen ? 'border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/40' : ''}`}
        onClick={() => hasChildren && setIsOpen(!isOpen)}
      >
        {/* Background Progress Bar */}
        <div 
          className="absolute left-0 top-0 bottom-0 bg-[#558B2F]/10 dark:bg-primary/10 z-[-1] transition-all duration-500 ease-out" 
          style={{ width: `${widthPercent}%` }} 
        />
        
        <div className="flex items-center gap-3 z-10 overflow-hidden">
          {hasChildren ? (
            <div className="text-slate-400">
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </div>
          ) : (
            <div className="w-4" /> // placeholder for alignment
          )}
          
          {iconUrl ? (
            <img src={iconUrl} alt="icon" className="w-4 h-4 object-contain" />
          ) : (
            <div className="w-4 h-4 flex items-center justify-center text-slate-400 dark:text-slate-500">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
            </div>
          )}
          
          <span className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate max-w-[200px] sm:max-w-[400px]">
            {group.project}
          </span>
        </div>
        
        <div className="flex items-center gap-3 z-10">
          <span className="font-mono font-bold text-xs text-[#558B2F] dark:text-primary whitespace-nowrap">
            {formatDuration(group.totalDuration)}
          </span>
        </div>
      </div>
      
      {/* Children list */}
      {isOpen && hasChildren && (
        <div className="flex flex-col bg-background/50 divide-y divide-slate-100 dark:divide-slate-800/50">
          {group.items.map((item: any, idx: number) => {
            const childWidthPercent = group.totalDuration > 0 ? (item.duration / group.totalDuration) * 100 : 0
            
            return (
              <div key={idx} 
                   onClick={() => onSelectDocument({ project: group.project, document: item.label, label: item.label })}
                   className="relative flex items-center justify-between p-2 pl-12 hover:bg-slate-100 dark:hover:bg-slate-800/30 cursor-pointer">
                <div 
                  className="absolute left-0 top-0 bottom-0 bg-[#558B2F]/5 dark:bg-primary/5 z-[-1] transition-all duration-500 ease-out" 
                  style={{ width: `${childWidthPercent}%` }} 
                />
                <div className="flex items-center gap-2 truncate">
                  {getDocumentIcon(appId, item.label, item.url, undefined, group.project) ? (
                    <img src={getDocumentIcon(appId, item.label, item.url, undefined, group.project)!} className="w-3.5 h-3.5 object-contain" />
                  ) : (
                    <div className="w-3.5 h-3.5 flex items-center justify-center text-slate-400">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                    </div>
                  )}
                  <span className="text-xs text-slate-600 dark:text-slate-300 truncate max-w-[200px] sm:max-w-[450px]">
                    {item.label}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-slate-500 whitespace-nowrap">
                  {formatDuration(item.duration)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Access Wails runtime & Go methods
const wails = (window as any).go?.main?.App

export function AppDetails({ appId, appName, appIcon, refreshKey = 0, onBack }: AppDetailsProps) {
  const [stats, setStats] = useState<AppUsageStat[]>([])
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [timeframe, setTimeframe] = useState<string>("today") // today, week, month

  const [viewMode, setViewMode] = useState<"graphs" | "documents">("graphs")
  const [documents, setDocuments] = useState<AppUsageStat[]>([])
  const [isLoading, setIsLoading] = useState(false)
  
  const [activeDocument, setActiveDocument] = useState<{ project: string, document: string, label: string } | null>(null)

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
  }, [appId, timeframe, viewMode, refreshKey])

  // 1.5 Fetch Documents Data
  useEffect(() => {
    if (viewMode === "documents") {
      const fetchDocs = async () => {
        setIsLoading(true)
        try {
          if (wails) {
            const res = await wails.GetAppDocumentStats(appId, timeframe)
            setDocuments(res || [])
          }
        } catch (err) {
          console.error("Error fetching documents:", err)
        } finally {
          setIsLoading(false)
        }
      }
      fetchDocs()
    }
  }, [appId, timeframe, viewMode, refreshKey])

  // Memoize grouped documents hierarchy at top level for React Rules of Hooks
  const nestedDocs = useMemo(() => {
    const map = new Map<string, { totalDuration: number; items: any[] }>()
    documents.forEach((d) => {
      let project = d.label
      let docName = d.label

      if (d.label.includes(" / ")) {
        const parts = d.label.split(" / ")
        project = parts[0].trim()
        docName = parts.slice(1).join(" / ").trim()
      }

      if (!map.has(project)) {
        map.set(project, { totalDuration: 0, items: [] })
      }

      const group = map.get(project)!
      group.totalDuration += d.duration_seconds
      if (project !== docName) {
        group.items.push({ label: docName, duration: d.duration_seconds, url: d.url })
      }
    })

    return Array.from(map.entries())
      .map(([project, data]) => ({
        project,
        totalDuration: data.totalDuration,
        items: data.items.sort((a, b) => b.duration - a.duration),
      }))
      .sort((a, b) => b.totalDuration - a.totalDuration)
  }, [documents])

  const maxDuration = useMemo(
    () => (nestedDocs.length > 0 ? Math.max(...nestedDocs.map((d) => d.totalDuration)) : 0),
    [nestedDocs]
  )

  const icicleData = useMemo<IcicleNode>(
    () => ({
      name: appName || appId,
      children: nestedDocs.map((g) => ({
        name: g.project,
        children:
          g.items.length > 0
            ? g.items.map((i) => ({ name: i.label, value: i.duration }))
            : [{ name: g.project, value: g.totalDuration }],
      })),
    }),
    [nestedDocs, appId, appName]
  )

  // (Session fetching removed)

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
              onClick={() => setViewMode("documents")}
              className={`px-3 py-1.5 rounded-none transition-all flex items-center gap-1.5 ${
                viewMode === "documents"
                  ? "bg-card text-slate-900 dark:text-slate-100 shadow-none"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
            >
              <Activity className="h-4 w-4" /> Content
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
              <div className="w-14 h-14 flex items-center justify-center text-slate-400 dark:text-slate-500">
                <AppWindow className="w-12 h-12 stroke-1" />
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

              </div>
            </CardHeader>

            <CardContent>
              {isLoading ? (
                <div className="h-[320px] flex items-center justify-center text-slate-500 font-semibold animate-pulse">Loading analytics...</div>
              ) : stats.length > 0 ? (
                <div className="w-full mt-4">
                  <MultiLineChart
                    title={`${appName || appId} Usage`}
                    subtitle={`Accumulated duration over timeframe (${timeframe})`}
                    height={300}
                    formatValue={formatDuration}
                    series={[
                      {
                        id: appId,
                        name: appName || appId,
                        color: "#558B2F",
                        values: stats.map((s) => ({
                          date: s.label,
                          value: s.duration_seconds,
                        })),
                      },
                    ]}
                  />
                </div>
              ) : (
                <div className="h-[320px] flex items-center justify-center text-slate-500 font-semibold">No usage data for this timeframe.</div>
              )}
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader className="flex flex-row items-center justify-between pb-3 flex-wrap gap-4">
              <div>
                <CardTitle className="text-xl font-black text-slate-900 dark:text-slate-100">Content Breakdown</CardTitle>
                <CardDescription className="text-slate-600 dark:text-slate-400 font-medium">Time spent on specific pages and documents</CardDescription>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
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
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-[400px] flex items-center justify-center text-slate-500 font-semibold animate-pulse">Loading content stats...</div>
              ) : documents.length > 0 ? (
                <div className="w-full mt-4 space-y-6 max-h-[700px] overflow-y-auto pr-2">
                  <div className="flex flex-col gap-6">
                    {/* D3 Icicle Chart for Project Hierarchy */}
                    {nestedDocs.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-black uppercase text-slate-500 tracking-wider">Interactive Project Flame Graph</div>
                        <IcicleChart
                          height={260}
                          formatValue={formatDuration}
                          data={icicleData}
                        />
                      </div>
                    )}

                    {/* Accordion List */}
                    <div className="space-y-2">
                      {nestedDocs.map((group, idx) => (
                        <AccordionItem 
                          key={idx} 
                          group={group} 
                          appId={appId} 
                          maxDuration={maxDuration} 
                          formatDuration={formatDuration} 
                          onSelectDocument={setActiveDocument}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-[400px] flex items-center justify-center text-slate-500 font-semibold">No detailed content history found.</div>
              )}
            </CardContent>
          </>
        )}
      </Card>
      
      {/* Github Heatmap */}
      <GithubHeatmap appId={appId} appName={appName} />

      <Dialog open={!!activeDocument} onOpenChange={(open) => !open && setActiveDocument(null)}>
        <DialogContent className="w-full max-w-[680px] max-h-[85vh] overflow-y-auto bg-card border border-border p-6 rounded-none shadow-2xl">
          {activeDocument && (
            <DocumentTimeline
              appId={appId}
              project={activeDocument.project}
              document={activeDocument.document}
              appIcon={getDocumentIcon(appId, activeDocument.label, undefined, undefined, activeDocument.project) || undefined}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
