import React, { useEffect, useRef } from "react"
import * as d3 from "d3"

export interface HorizonSeries {
  name: string
  values: { date: Date | string; value: number }[]
  color?: string
}

interface HorizonChartProps {
  series: HorizonSeries[]
  bands?: number
  rowHeight?: number
  formatValue?: (val: number) => string
}

function defaultFormat(val: number): string {
  if (val <= 0) return "0s"
  const hrs = Math.floor(val / 3600)
  const mins = Math.floor((val % 3600) / 60)
  if (hrs > 0) return `${hrs}h ${mins}m`
  return `${mins}m`
}

export function HorizonChart({
  series,
  bands = 3,
  rowHeight = 36,
  formatValue = defaultFormat,
}: HorizonChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!containerRef.current || !svgRef.current || !series || series.length === 0) return

    const width = containerRef.current.clientWidth || 700
    const margin = { top: 30, right: 10, bottom: 0, left: 10 }
    const innerWidth = width - margin.left - margin.right
    const totalHeight = margin.top + series.length * rowHeight + margin.bottom

    const svg = d3.select(svgRef.current)
    svg.selectAll("*").remove()

    svg
      .attr("viewBox", [0, 0, width, totalHeight])
      .attr("width", "100%")
      .attr("height", totalHeight)
      .style("font-family", "ui-sans-serif, system-ui, sans-serif")

    // Collect all dates for X scale
    const allDates: Date[] = []
    series.forEach((s) => {
      s.values.forEach((v) => {
        allDates.push(typeof v.date === "string" ? new Date(v.date) : v.date)
      })
    })

    if (allDates.length === 0) return

    const xExtent = d3.extent(allDates) as [Date, Date]
    const xScale = d3.scaleTime().domain(xExtent).range([margin.left, width - margin.right])

    // Draw X Axis at the top
    svg
      .append("g")
      .attr("transform", `translate(0,${margin.top})`)
      .call(d3.axisTop(xScale).ticks(width / 80).tickSizeOuter(0))
      .call((g) => g.selectAll(".tick").filter((d: any) => xScale(d) < margin.left || xScale(d) >= width - margin.right).remove())
      .call((g) => g.select(".domain").remove())
      .attr("color", "#64748b")

    // Tooltip
    const tooltip = d3
      .select(containerRef.current)
      .selectAll<HTMLDivElement, unknown>(".d3-horizon-tooltip")
      .data([null])
      .join("div")
      .attr("class", "d3-horizon-tooltip")
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

    const uid = `horizon-${Math.random().toString(16).slice(2)}`
    
    // Group per series
    const g = svg
      .append("g")
      .selectAll("g")
      .data(series)
      .join("g")
      .attr("transform", (d, i) => `translate(0,${i * rowHeight + margin.top})`)

    const padding = 1

    series.forEach((s, i) => {
      const rowMax = d3.max(s.values, (v) => v.value) || 1
      
      // Vertical scale: maps 0 to rowHeight, and max to rowHeight - bands * rowHeight
      const yScale = d3
        .scaleLinear()
        .domain([0, rowMax])
        .range([rowHeight, rowHeight - bands * (rowHeight - padding)])

      const area = d3
        .area<{ date: Date | string; value: number }>()
        .defined((d) => !isNaN(d.value))
        .x((d) => xScale(typeof d.date === "string" ? new Date(d.date) : d.date))
        .y0(rowHeight)
        .y1((d) => yScale(d.value))
        .curve(d3.curveMonotoneX)

      const baseColor = s.color || "#257a82"
      // Generate colors for bands (light to dark)
      const colors = d3.schemeBlues[Math.max(3, Math.min(9, bands + 2))] || d3.quantize(d3.interpolateBlues, bands)
      // If a custom color is provided, we can interpolate from white to that color
      const customColors = d3.quantize(d3.interpolate("rgba(255,255,255,0.1)", baseColor), bands + 1).slice(1)
      const bandColors = s.color ? customColors : colors

      const rowGroup = g.filter((_, idx) => idx === i)
      
      // Native SVG clipping (bypasses WebKit clip-path bugs)
      const innerSvg = rowGroup
        .append("svg")
        .attr("x", margin.left)
        .attr("y", padding)
        .attr("width", innerWidth)
        .attr("height", rowHeight - padding)

      // Inner group must shift X and Y backwards because innerSvg established new coordinate system at x, y
      const bandGroup = innerSvg
        .append("g")
        .attr("transform", `translate(-${margin.left}, -${padding})`)

      const areaPathStr = area(s.values) || ""

      // Append actual paths explicitly (bypasses WebKit <use> href bugs)
      for (let b = 0; b < bands; b++) {
        bandGroup
          .append("path")
          .attr("d", areaPathStr)
          .attr("fill", bandColors[b])
          .attr("transform", `translate(0,${b * rowHeight})`)
      }

      // Add labels
      rowGroup
        .append("text")
        .attr("x", margin.left + 4)
        .attr("y", (rowHeight + padding) / 2)
        .attr("dy", "0.35em")
        .attr("fill", "currentColor")
        .attr("font-size", "11px")
        .attr("font-weight", "700")
        .attr("pointer-events", "none")
        .text(s.name)

      // Hover overlay
      rowGroup
        .append("rect")
        .attr("x", margin.left)
        .attr("y", padding)
        .attr("width", innerWidth)
        .attr("height", rowHeight - padding)
        .attr("fill", "transparent")
        .attr("cursor", "crosshair")
        .on("mousemove", function (event) {
          const [xm] = d3.pointer(event, this)
          const dateAtMouse = xScale.invert(xm)

          const bisect = d3.bisector((d: { date: Date | string }) =>
            typeof d.date === "string" ? new Date(d.date) : d.date
          ).left
          const idx = bisect(s.values, dateAtMouse, 1)
          const d0 = s.values[idx - 1]
          const d1 = s.values[idx]
          let closest = d0
          if (d0 && d1) {
            const t0 = typeof d0.date === "string" ? new Date(d0.date).getTime() : d0.date.getTime()
            const t1 = typeof d1.date === "string" ? new Date(d1.date).getTime() : d1.date.getTime()
            closest = dateAtMouse.getTime() - t0 > t1 - dateAtMouse.getTime() ? d1 : d0
          }

          if (closest && containerRef.current) {
            const dateObj = typeof closest.date === "string" ? new Date(closest.date) : closest.date
            
            // Format time nicely based on scale (hours/days)
            const timeDiff = xExtent[1].getTime() - xExtent[0].getTime()
            const dateStr = timeDiff < 86400000 * 2 // < 2 days
              ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : dateObj.toLocaleDateString()

            tooltip
              .style("visibility", "visible")
              .style("top", `${event.offsetY - 35}px`)
              .style("left", `${Math.min(event.offsetX + 15, width - 150)}px`)
              .html(
                `<div class="font-medium text-xs">${s.name}</div>` +
                  `<div class="text-[10px] opacity-75">${dateStr}: <span class=" font-medium text-primary">${formatValue(
                    closest.value
                  )}</span></div>`
              )
          }
        })
        .on("mouseout", () => tooltip.style("visibility", "hidden"))
    })
  }, [series, bands, rowHeight, formatValue])

  return (
    <div className="w-full relative overflow-hidden bg-card rounded-xl" ref={containerRef}>
      <svg ref={svgRef} className="w-full block" />
    </div>
  )
}
