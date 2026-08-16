import React, { useEffect, useRef } from "react"
import * as d3 from "d3"

export interface CalendarDayValue {
  date: string // YYYY-MM-DD
  value: number // duration in seconds
}

interface CalendarGridProps {
  data: CalendarDayValue[]
  year?: number
  formatValue?: (val: number) => string
}

function defaultFormat(val: number): string {
  if (val <= 0) return "No activity"
  const hrs = Math.floor(val / 3600)
  const mins = Math.floor((val % 3600) / 60)
  if (hrs > 0) return `${hrs}h ${mins}m`
  return `${mins}m`
}

export function CalendarGrid({
  data,
  year = new Date().getFullYear(),
  formatValue = defaultFormat,
}: CalendarGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!containerRef.current || !svgRef.current) return

    const containerWidth = containerRef.current.clientWidth || 750
    const cellSize = Math.max(10, Math.floor((containerWidth - 60) / 53) - 2)
    const margin = { top: 25, right: 15, bottom: 15, left: 35 }
    const width = 53 * (cellSize + 2) + margin.left + margin.right
    const height = 7 * (cellSize + 2) + margin.top + margin.bottom

    const svg = d3.select(svgRef.current)
    svg.selectAll("*").remove()

    svg
      .attr("viewBox", [0, 0, width, height])
      .attr("width", "100%")
      .attr("height", height)

    // Data lookup map
    const dataMap = new Map<string, number>()
    data.forEach((d) => dataMap.set(d.date, d.value))

    // Max value for scaling
    const maxVal = d3.max(data, (d) => d.value) || 1

    // Color scale for 5 levels (0-4)
    const colorScale = d3
      .scaleThreshold<number, string>()
      .domain([1, maxVal * 0.25, maxVal * 0.5, maxVal * 0.75])
      .range([
        "var(--secondary)", // 0: no activity
        "#d1b96e", // Level 1 (Soft Mustard)
        "#c58b68", // Level 2
        "#b55c5a", // Level 3 (Soft Red)
        "#8a4947", // Level 4 (Dark Soft Red)
      ])

    // Generate 365 days for the target year
    const start = new Date(year, 0, 1)
    const end = new Date(year, 11, 31)
    const days = d3.timeDays(start, d3.timeDay.offset(end, 1))

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)

    // Day of week labels (Mon, Wed, Fri)
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    const showDays = [1, 3, 5] // Mon, Wed, Fri
    showDays.forEach((dayIdx) => {
      g.append("text")
        .attr("x", -8)
        .attr("y", dayIdx * (cellSize + 2) + cellSize / 2 + 3)
        .attr("text-anchor", "end")
        .attr("fill", "#64748b")
        .attr("font-size", "9px")
        .attr("font-weight", "600")
        .text(dayNames[dayIdx])
    })

    // Month Header Labels
    const months = d3.timeMonths(start, end)
    months.forEach((month) => {
      const weekIndex = d3.timeWeek.count(start, month)
      g.append("text")
        .attr("x", weekIndex * (cellSize + 2))
        .attr("y", -8)
        .attr("fill", "currentColor")
        .attr("font-size", "10px")
        .attr("font-weight", "700")
        .text(d3.timeFormat("%b")(month))
    })

    // Tooltip selection
    const tooltip = d3
      .select(containerRef.current)
      .selectAll<HTMLDivElement, unknown>(".d3-calendar-tooltip")
      .data([null])
      .join("div")
      .attr("class", "d3-calendar-tooltip")
      .style("position", "absolute")
      .style("visibility", "hidden")
      .style("pointer-events", "none")
      .style("z-index", "50")
      .style("background", "hsl(var(--card))")
      .style("color", "hsl(var(--foreground))")
      .style("border", "1px solid hsl(var(--border))")
      .style("padding", "6px 10px")
      .style("font-size", "11px")
      .style("font-weight", "600")
      .style("box-shadow", "0 4px 6px -1px rgba(0,0,0,0.2)")

    // Render cells
    g.selectAll("rect")
      .data(days)
      .join("rect")
      .attr("width", cellSize)
      .attr("height", cellSize)
      .attr("x", (d) => d3.timeWeek.count(start, d) * (cellSize + 2))
      .attr("y", (d) => d.getDay() * (cellSize + 2))
      .attr("rx", 2)
      .attr("ry", 2)
      .attr("fill", (d) => {
        const dateStr = d3.timeFormat("%Y-%m-%d")(d)
        const val = dataMap.get(dateStr) || 0
        return colorScale(val)
      })
      .style("cursor", "pointer")
      .style("transition", "transform 0.1s ease, filter 0.1s ease")
      .on("mouseover", function (event, d) {
        d3.select(this).style("filter", "brightness(1.25)")
        const dateStr = d3.timeFormat("%Y-%m-%d")(d)
        const displayDate = d3.timeFormat("%B %d, %Y")(d)
        const val = dataMap.get(dateStr) || 0
        tooltip
          .style("visibility", "visible")
          .html(
            `<div class="font-medium text-xs">${displayDate}</div>` +
              `<div class="text-[11px]  text-primary mt-0.5">${formatValue(val)}</div>`
          )
      })
      .on("mousemove", function (event) {
        if (!containerRef.current) return
        const [x, y] = d3.pointer(event, containerRef.current)
        tooltip
          .style("top", `${y - 45}px`)
          .style("left", `${Math.min(x + 10, containerWidth - 140)}px`)
      })
      .on("mouseout", function () {
        d3.select(this).style("filter", "none")
        tooltip.style("visibility", "hidden")
      })
  }, [data, year, formatValue])

  return (
    <div className="w-full relative overflow-hidden bg-card border border-border rounded-xl p-4 space-y-2" ref={containerRef}>
      <svg ref={svgRef} className="w-full block" />

      {/* Activity Strength Legend */}
      <div className="flex items-center justify-end gap-2 text-xs text-slate-500  pt-1 border-t border-border/40">
        <span>Less</span>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-secondary border border-border" title="No activity (0)" />
          <span className="w-3 h-3 rounded-sm bg-[#d1b96e]" title="Low activity" />
          <span className="w-3 h-3 rounded-sm bg-[#c58b68]" title="Medium activity" />
          <span className="w-3 h-3 rounded-sm bg-[#b55c5a]" title="High activity" />
          <span className="w-3 h-3 rounded-sm bg-[#8a4947]" title="Very high activity" />
        </div>
        <span>More</span>
      </div>
    </div>
  )
}
