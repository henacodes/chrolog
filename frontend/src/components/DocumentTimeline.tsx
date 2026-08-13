import React, { useEffect, useState, useMemo } from 'react'
import { format, parseISO, startOfDay, differenceInSeconds } from 'date-fns'
import { CalendarIcon, Clock, PlayCircle, PauseCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const wails = (window as any).go?.main?.App

interface SessionRecord {
  id: number
  app_id: string
  app_name: string
  window_title: string
  started_at: string
  ended_at: string
  duration_seconds: number
  metadata?: Record<string, string>
}

interface DocumentTimelineProps {
  appId: string
  project: string
  document: string
  appIcon?: string
}

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hrs > 0) return `${hrs}h ${mins}m`
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

// Only show labels at these hours to avoid crowding in small containers
const LABEL_HOURS = [0, 6, 12, 18, 24]

export function DocumentTimeline({ appId, project, document, appIcon }: DocumentTimelineProps) {
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let mounted = true
    setIsLoading(true)
    const fetchSessions = async () => {
      if (!wails) { if (mounted) setIsLoading(false); return }
      try {
        const res = await wails.GetDocumentSessions(appId, project, document)
        if (!mounted) return
        const data: SessionRecord[] = res || []
        setSessions(data)
        // Find most recent date
        const allDates = data.map(s => format(parseISO(s.started_at), 'yyyy-MM-dd'))
        if (allDates.length > 0) {
          const sorted = [...new Set(allDates)].sort((a, b) => b.localeCompare(a))
          setSelectedDate(sorted[0])
        }
      } catch (e) {
        console.error('Failed to fetch document sessions', e)
      } finally {
        if (mounted) setIsLoading(false)
      }
    }
    fetchSessions()
    return () => { mounted = false }
  }, [appId, project, document])

  const availableDates = useMemo(() => {
    const d = [...new Set(sessions.map(s => format(parseISO(s.started_at), 'yyyy-MM-dd')))]
    return d.sort((a, b) => b.localeCompare(a))
  }, [sessions])

  const daySessions = useMemo(() => {
    if (!selectedDate) return []
    return sessions.filter(s => format(parseISO(s.started_at), 'yyyy-MM-dd') === selectedDate)
  }, [sessions, selectedDate])

  const totalDuration = useMemo(
    () => daySessions.reduce((acc, s) => acc + s.duration_seconds, 0),
    [daySessions]
  )

  // Extract YouTube info from the most recently-ended session that has video data
  let isPlaying = false
  let channelName = ''
  let videoId = ''
  const ytSession = [...daySessions].reverse().find(s => s.metadata?.platform_specific)
  if (ytSession?.metadata?.platform_specific) {
    try {
      const plat = JSON.parse(ytSession.metadata.platform_specific)
      if (plat?.youtube) {
        isPlaying = plat.youtube.is_playing
        channelName = plat.youtube.channel_name || ''
        videoId = plat.youtube.video_id || ''
      }
    } catch { /* ignore */ }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-500 dark:text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <Clock className="h-8 w-8 animate-spin opacity-40" />
          <span className="text-sm font-medium">Loading timeline…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 w-full overflow-hidden">

      {/* ── Header row ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        {/* Title */}
        <div className="flex items-center gap-2 min-w-0">
          {appIcon && (
            <img src={appIcon} className="w-7 h-7 object-contain shrink-0 rounded-none" alt="icon" />
          )}
          <div className="min-w-0">
            {project && (
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 truncate">
                {project}
              </p>
            )}
            <h2 className="text-lg font-black text-slate-900 dark:text-slate-100 truncate leading-snug">
              {document}
            </h2>
          </div>
        </div>

        {/* Date picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 font-semibold text-xs gap-1.5 h-8 px-3 border-slate-200 dark:border-slate-700"
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              {selectedDate ? format(parseISO(selectedDate), 'MMM d, yyyy') : 'Pick date'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 z-[200]" align="end" sideOffset={6}>
            <Calendar
              mode="single"
              selected={selectedDate ? parseISO(selectedDate) : undefined}
              onSelect={date => date && setSelectedDate(format(date, 'yyyy-MM-dd'))}
              disabled={date => !availableDates.includes(format(date, 'yyyy-MM-dd'))}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* ── Stats row ──────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary font-bold px-3 py-1.5 rounded-none">
          <Clock className="h-3.5 w-3.5" />
          {formatDuration(totalDuration)} today
        </span>

        {videoId && channelName && (
          <span className="inline-flex items-center gap-1.5 font-bold px-3 py-1.5 rounded-none border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300">
            {channelName}
          </span>
        )}

        {ytSession?.metadata?.category && (
          <span className="inline-flex items-center gap-1 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-semibold px-3 py-1.5 rounded-none uppercase tracking-wide">
            {ytSession.metadata.category}
          </span>
        )}
      </div>

      {/* ── YouTube thumbnail ──────────────────────────────────── */}
      {videoId && (
        <div className="w-full overflow-hidden rounded-none border border-slate-200 dark:border-slate-800 shadow-md relative group bg-black">
          <img
            src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
            alt="Video thumbnail"
            className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
          {isPlaying && (
            <div className="absolute inset-0 bg-red-500/10 pointer-events-none" />
          )}
        </div>
      )}

      {/* ── 24-hour timeline ───────────────────────────────────── */}
      {daySessions.length > 0 ? (
        <div className="w-full">
          {/* Labels row — rendered ABOVE the bar, inside a relative container with enough top padding */}
          <div className="relative w-full" style={{ paddingTop: '20px' }}>
            {/* Hour labels */}
            {LABEL_HOURS.map(hour => (
              <div
                key={hour}
                className="absolute top-0 text-[10px] font-mono font-semibold text-slate-400 dark:text-slate-500 -translate-x-1/2"
                style={{ left: `${(hour / 24) * 100}%` }}
              >
                {hour === 0 || hour === 24 ? '12a' : hour < 12 ? `${hour}a` : hour === 12 ? '12p' : `${hour - 12}p`}
              </div>
            ))}

            {/* Bar */}
            <div className="relative w-full h-10 bg-slate-100 dark:bg-slate-800 rounded-none border border-slate-200 dark:border-slate-700 overflow-hidden shadow-inner">
              {/* Subtle grid lines inside the bar */}
              {[6, 12, 18].map(hour => (
                <div
                  key={hour}
                  className="absolute top-0 bottom-0 w-px bg-slate-200 dark:bg-slate-700/80"
                  style={{ left: `${(hour / 24) * 100}%` }}
                />
              ))}

              {/* Session blocks */}
              {(() => {
                const dayStart = startOfDay(parseISO(selectedDate!))
                const TOTAL = 86400
                return daySessions.map((session, idx) => {
                  const startSec = differenceInSeconds(parseISO(session.started_at), dayStart)
                  const durSec = session.duration_seconds
                  let left = (startSec / TOTAL) * 100
                  const width = (durSec / TOTAL) * 100
                  if (left < 0) left = 0
                  if (left >= 100) return null

                  const clampedWidth = Math.min(width, 100 - left)

                  return (
                    <div
                      key={idx}
                      className="absolute inset-y-0 bg-primary hover:bg-primary/80 transition-colors cursor-default"
                      style={{
                        left: `${left}%`,
                        width: `${Math.max(clampedWidth, 0.3)}%`,
                      }}
                      title={`${format(parseISO(session.started_at), 'h:mm a')} – ${format(parseISO(session.ended_at), 'h:mm a')} (${formatDuration(session.duration_seconds)})`}
                    />
                  )
                })
              })()}

              {/* Current time indicator */}
              {selectedDate === format(currentTime, 'yyyy-MM-dd') && (() => {
                const dayStart = startOfDay(currentTime)
                const currentSec = differenceInSeconds(currentTime, dayStart)
                const left = (currentSec / 86400) * 100
                return (
                  <div 
                    className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-10 opacity-75"
                    style={{ left: `${left}%` }}
                    title={`Current Time: ${format(currentTime, 'h:mm a')}`}
                  >
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-red-500" />
                  </div>
                )
              })()}
            </div>
          </div>

          {/* Sessions list */}
          <div className="mt-4 flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
            {[...daySessions].reverse().map((session, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-4 px-3 py-2 rounded-none bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs"
              >
                <span className="font-mono text-slate-500 dark:text-slate-400 shrink-0">
                  {format(parseISO(session.started_at), 'h:mm a')}
                  {' – '}
                  {format(parseISO(session.ended_at), 'h:mm a')}
                </span>
                <span className="font-bold text-primary shrink-0">{formatDuration(session.duration_seconds)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-28 rounded-none border border-dashed border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 text-sm font-medium">
          No sessions recorded for {selectedDate ? format(parseISO(selectedDate), 'MMMM d, yyyy') : 'this date'}.
        </div>
      )}
    </div>
  )
}
