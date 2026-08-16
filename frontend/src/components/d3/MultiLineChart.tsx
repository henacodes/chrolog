import React, { useEffect, useRef, useState } from "react"
import * as d3 from "d3"

export interface LineSeriesData {
  id: string
  name: string
  color: string
  values: { date: Date | string; value: number }[]
}

interface MultiLineChartProps {
  series: LineSeriesData[]
  title?: string
  subtitle?: string
  height?: number
  formatValue?: (val: number) => string
}

function defaultFormat(val: number): string {
  if (val <= 0) return "0s"
  const hrs = Math.floor(val / 3600)
  const mins = Math.floor((val % 3600) / 60)
  if (hrs > 0) return `${hrs}h ${mins}m`
  return `${mins}m`
}

// Robust helper to parse ISO dates, Date objects, AND hourly strings like '06:00'
function parseChartDate(raw: Date | string): Date {
  if (raw instanceof Date) return raw
  if (typeof raw !== "string") return new Date()

  // 1. Try standard Date parsing (e.g. '2026-08-16')
  const d = new Date(raw)
  if (!isNaN(d.getTime())) return d

  // 2. Try parsing HH:MM hourly strings from backend (e.g. '06:00')
  const hourMatch = raw.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (hourMatch) {
    const hours = parseInt(hourMatch[1], 10)
    const minutes = parseInt(hourMatch[2], 10)
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0)
  }

  return new Date()
}

export function MultiLineChart({
  series,
  title,
  subtitle,
  height = 300,
  formatValue = defaultFormat,
}: MultiLineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [hiddenSeries, setHiddenSeries] = useState<Record<string, boolean>>({})

  const toggleSeries = (id: string) => {
    setHiddenSeries((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  useEffect(() => {
    if (!containerRef.current || !svgRef.current || !series || series.length === 0) return

    const width = containerRef.current.clientWidth || 700
    const margin = { top: 20, right: 30, bottom: 40, left: 60 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    const svg = d3.select(svgRef.current)
    svg.selectAll("*").remove()

    svg
      .attr("viewBox", [0, 0, width, height])
      .attr("width", "100%")
      .attr("height", height)

    const activeSeries = series.filter((s) => !hiddenSeries[s.id])

    // Parse all dates & values
    const parsedSeries = activeSeries.map((s) => ({
      ...s,
      parsedValues: s.values.map((v) => ({
        date: parseChartDate(v.date),
        value: v.value,
        originalDate: v.date,
      })),
    }))

    const allDates: Date[] = []
    let allValues: number[] = [0] // baseline

    parsedSeries.forEach((s) => {
      s.parsedValues.forEach((v) => {
        if (!isNaN(v.date.getTime())) allDates.push(v.date)
        allValues.push(v.value)
      })
    })

    if (allDates.length === 0) return

    // X Scale Domain Calculation
    let [minDate, maxDate] = d3.extent(allDates) as [Date, Date]
    const isSinglePoint = minDate.getTime() === maxDate.getTime()

    // Determine if data points are within a single day (e.g. '06:00', '07:00')
    const isSingleDay =
      minDate.getFullYear() === maxDate.getFullYear() &&
      minDate.getMonth() === maxDate.getMonth() &&
      minDate.getDate() === maxDate.getDate()

    if (isSinglePoint) {
      // Pad by 6 hours before and after so single data points render centered
      minDate = new Date(minDate.getTime() - 6 * 3600 * 1000)
      maxDate = new Date(maxDate.getTime() + 6 * 3600 * 1000)
    } else if (isSingleDay) {
      // Extend X axis across full 24h day (00:00 to 23:59) for daily view
      minDate = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate(), 0, 0, 0)
      maxDate = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate(), 23, 59, 59)
    }

    const xScale = d3.scaleTime().domain([minDate, maxDate]).range([0, innerWidth])

    // Y Scale
    const yMin = d3.min(allValues) || 0
    const yMax = d3.max(allValues) || 1
    const yScale = d3
      .scaleLinear()
      .domain([yMin < 0 ? yMin * 1.1 : 0, yMax * 1.1])
      .nice()
      .range([innerHeight, 0])

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)

    // Background Gridlines
    const yAxisGrid = d3.axisLeft(yScale).ticks(5).tickSize(-innerWidth).tickFormat(() => "")
    g.append("g")
      .attr("class", "grid")
      .call(yAxisGrid)
      .selectAll("line")
      .attr("stroke", "#334155")
      .attr("stroke-opacity", 0.25)

    // Zero Baseline indicator line
    if (yMin < 0 && yMax > 0) {
      g.append("line")
        .attr("x1", 0)
        .attr("x2", innerWidth)
        .attr("y1", yScale(0))
        .attr("y2", yScale(0))
        .attr("stroke", "#64748b")
        .attr("stroke-width", 1)
        .attr("stroke-opacity", 0.6)
    }

    // Dynamic X Axis formatting (HH:MM for single day, MMM DD for multiple days)
    const tickFormat = isSingleDay
      ? d3.timeFormat("%H:%M")
      : d3.timeFormat("%b %d")

    const xAxis = d3
      .axisBottom(xScale)
      .ticks(isSingleDay ? 8 : 6)
      .tickFormat((d) => tickFormat(d as Date))
      .tickSizeOuter(0)

    g.append("g")
      .attr("transform", `translate(0, ${innerHeight})`)
      .call(xAxis)
      .attr("color", "#64748b")
      .style("font-size", "10px")
      .style("font-weight", "600")

    // Y Axis
    const yAxis = d3
      .axisLeft(yScale)
      .ticks(5)
      .tickFormat((d) => formatValue(Number(d)))

    g.append("g")
      .call(yAxis)
      .attr("color", "#64748b")
      .style("font-size", "10px")
      .style("font-weight", "600")
      .select(".domain")
      .remove()

    // SHARP-EDGED / LINEAR Line Generator (matching cashflow design reference)
    const lineGenerator = d3
      .line<{ date: Date; value: number }>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.value))
      .curve(d3.curveLinear) // Sharp straight line segments!

    // Draw active series paths & point dots
    parsedSeries.forEach((s) => {
      if (s.parsedValues.length > 0) {
        // Line path
        g.append("path")
          .datum(s.parsedValues)
          .attr("fill", "none")
          .attr("stroke", s.color)
          .attr("stroke-width", 2.2)
          .attr("d", lineGenerator)
          .attr("stroke-linecap", "round")
          .attr("stroke-linejoin", "round")

        // Circle dots for each data point
        g.selectAll(`.dot-${s.id}`)
          .data(s.parsedValues)
          .join("circle")
          .attr("class", `dot-${s.id}`)
          .attr("cx", (d) => xScale(d.date))
          .attr("cy", (d) => yScale(d.value))
          .attr("r", 4)
          .attr("fill", s.color)
          .attr("stroke", "#1c1f23")
          .attr("stroke-width", 1.5)
      }
    })

    // Crosshair Guide Line
    const crosshair = g
      .append("line")
      .attr("y1", 0)
      .attr("y2", innerHeight)
      .attr("stroke", "#94a3b8")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "4,4")
      .style("opacity", 0)
      .style("pointer-events", "none")

    // Tooltip Selection
    const tooltip = d3
      .select(containerRef.current)
      .selectAll<HTMLDivElement, unknown>(".d3-multiline-tooltip")
      .data([null])
      .join("div")
      .attr("class", "d3-multiline-tooltip")
      .style("position", "absolute")
      .style("visibility", "hidden")
      .style("pointer-events", "none")
      .style("z-index", "50")
      .style("background", "hsl(var(--card))")
      .style("color", "hsl(var(--foreground))")
      .style("border", "1px solid hsl(var(--border))")
      .style("padding", "8px 12px")
      .style("font-size", "12px")
      .style("font-weight", "600")
      .style("box-shadow", "0 10px 15px -3px rgba(0,0,0,0.3)")

    // Overlay Rect for Mouse Interaction
    g.append("rect")
      .attr("width", innerWidth)
      .attr("height", innerHeight)
      .attr("fill", "transparent")
      .attr("cursor", "crosshair")
      .on("mousemove", function (event) {
        const [xm] = d3.pointer(event, this)
        const dateAtMouse = xScale.invert(xm)

        crosshair.attr("x1", xm).attr("x2", xm).style("opacity", 1)

        const timeLabel = isSingleDay
          ? d3.timeFormat("%H:%M")(dateAtMouse)
          : d3.timeFormat("%b %d, %Y")(dateAtMouse)

        let tooltipHtml = `<div class="text-[10px] text-slate-400 font-mono mb-1">${timeLabel}</div>`

        parsedSeries.forEach((s) => {
          if (s.parsedValues.length === 0) return
          const bisect = d3.bisector((d: { date: Date }) => d.date).left
          const idx = bisect(s.parsedValues, dateAtMouse, 1)
          const d0 = s.parsedValues[idx - 1]
          const d1 = s.parsedValues[idx]
          let closest = d0
          if (d0 && d1) {
            closest = dateAtMouse.getTime() - d0.date.getTime() > d1.date.getTime() - dateAtMouse.getTime() ? d1 : d0
          }

          if (closest) {
            tooltipHtml += `<div class="flex items-center justify-between gap-3 text-xs">`
            tooltipHtml += `<span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full" style="background:${s.color}"></span>${s.name}</span>`
            tooltipHtml += `<span class="font-mono font-bold" style="color:${s.color}">${formatValue(closest.value)}</span>`
            tooltipHtml += `</div>`
          }
        })

        tooltip
          .style("visibility", "visible")
          .style("top", `${event.offsetY - 40}px`)
          .style("left", `${Math.min(event.offsetX + 20, width - 180)}px`)
          .html(tooltipHtml)
      })
      .on("mouseout", () => {
        crosshair.style("opacity", 0)
        tooltip.style("visibility", "hidden")
      })
  }, [series, height, hiddenSeries, formatValue])

  return (
    <div className="w-full relative bg-card border border-border rounded-none p-4 space-y-3" ref={containerRef}>
      {(title || subtitle) && (
        <div className="flex flex-col space-y-0.5">
          {title && <h3 className="text-base font-black tracking-tight text-foreground">{title}</h3>}
          {subtitle && <p className="text-xs text-slate-500 font-medium">{subtitle}</p>}
        </div>
      )}

      {/* SVG Container */}
      <div className="w-full relative">
        <svg ref={svgRef} className="w-full block" />
      </div>

      {/* Interactive Legend */}
      <div className="flex items-center justify-center flex-wrap gap-3 pt-1 border-t border-border/40">
        {series.map((s) => {
          const isHidden = hiddenSeries[s.id]
          return (
            <button
              key={s.id}
              onClick={() => toggleSeries(s.id)}
              className={`flex items-center gap-2 px-2.5 py-1 text-xs font-bold rounded-none border transition-all ${
                isHidden
                  ? "border-slate-300 dark:border-slate-800 text-slate-400 opacity-50 line-through"
                  : "border-border text-foreground shadow-none"
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              <span>{s.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
