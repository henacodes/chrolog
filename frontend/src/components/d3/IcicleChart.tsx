import React, { useEffect, useRef, useState, useCallback } from "react"
import * as d3 from "d3"

export interface IcicleNode {
  name: string
  value?: number
  children?: IcicleNode[]
  icon?: string
  color?: string
}

interface IcicleChartProps {
  data: IcicleNode
  height?: number
  formatValue?: (val: number) => string
  onNodeClick?: (node: IcicleNode) => void
}

function defaultFormat(val: number): string {
  if (val <= 0) return "0s"
  const hrs = Math.floor(val / 3600)
  const mins = Math.floor((val % 3600) / 60)
  const secs = Math.floor(val % 60)
  if (hrs > 0) return `${hrs}h ${mins}m`
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

const COLOR_PALETTE = [
  '#609fa5', // Soft Teal
  '#d1b96e', // Soft Mustard
  '#b55c5a', // Soft Red
  '#e5ddc5', // Soft Warm Gray
  '#445a6f', // Soft Navy
]

export function IcicleChart({
  data,
  height = 360,
  formatValue,
  onNodeClick,
}: IcicleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [breadcrumb, setBreadcrumb] = useState<d3.HierarchyRectangularNode<IcicleNode>[]>([])

  // Keep formatValue in a ref — never triggers effect re-runs
  const formatRef = useRef<(v: number) => string>(formatValue ?? defaultFormat)
  useEffect(() => {
    formatRef.current = formatValue ?? defaultFormat
  }, [formatValue])

  // Persist zoom path across re-renders
  const activeFocusPathRef = useRef<string[]>([])

  // Expose zoomToNode so breadcrumb can call it without re-running the effect
  const zoomFnRef = useRef<((node: d3.HierarchyRectangularNode<IcicleNode>, animate?: boolean) => void) | null>(null)

  useEffect(() => {
    if (!containerRef.current || !svgRef.current || !data) return

    const width = containerRef.current.clientWidth || 700
    const svg = d3.select(svgRef.current)
    svg.selectAll("*").remove()

    const rootNode = d3
      .hierarchy(data)
      .sum((d) => (d.children && d.children.length > 0 ? 0 : d.value || 0))
      .sort((a, b) => (b.value || 0) - (a.value || 0))

    const partition = d3.partition<IcicleNode>().size([height, width])
    const root = partition(rootNode) as d3.HierarchyRectangularNode<IcicleNode>

    const colorScale = d3.scaleOrdinal(COLOR_PALETTE)

    const getColor = (d: d3.HierarchyRectangularNode<IcicleNode>) => {
      if (d.data.color) return d.data.color
      let ancestor = d
      while (ancestor.depth > 1 && ancestor.parent) {
        ancestor = ancestor.parent as d3.HierarchyRectangularNode<IcicleNode>
      }
      return colorScale(ancestor.data.name)
    }

    svg
      .attr("viewBox", [0, 0, width, height])
      .attr("width", "100%")
      .attr("height", height)
      .style("font-family", "ui-sans-serif, system-ui, sans-serif")
      .style("overflow", "hidden")

    const tooltip = d3
      .select(containerRef.current)
      .selectAll<HTMLDivElement, unknown>(".d3-icicle-tooltip")
      .data([null])
      .join("div")
      .attr("class", "d3-icicle-tooltip")
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

    const g = svg.append("g")
    const descendants = root.descendants() as d3.HierarchyRectangularNode<IcicleNode>[]

    const cell = g
      .selectAll<SVGGElement, d3.HierarchyRectangularNode<IcicleNode>>("g")
      .data(descendants)
      .join("g")
      .attr("transform", (d) => `translate(${d.y0},${d.x0})`)
      .style("cursor", "pointer")

    const rect = cell
      .append("rect")
      .attr("width", (d) => Math.max(0, d.y1 - d.y0 - 1))
      .attr("height", (d) => Math.max(0, d.x1 - d.x0 - 1))
      .attr("fill", (d) => getColor(d))
      .attr("opacity", (d) => (d.depth === 0 ? 0.25 : 0.85))
      .attr("rx", 2)
      .attr("ry", 2)

    rect
      .on("mouseover", function (event, d) {
        d3.select(this).attr("opacity", 1).style("filter", "brightness(1.15)")
        const total = root.value || 1
        const pct = (((d.value || 0) / total) * 100).toFixed(1)
        tooltip
          .style("visibility", "visible")
          .html(
            `<div style="font-weight:700;font-size:13px;margin-bottom:4px">${d.data.name}</div>` +
              `<div style="font-size:11px;opacity:0.8">Duration: <strong>${formatRef.current(d.value || 0)}</strong> (${pct}%)</div>` +
              (d.children?.length
                ? `<div style="font-size:10px;opacity:0.55;margin-top:4px">Click to zoom in · Breadcrumb to zoom out</div>`
                : "")
          )
      })
      .on("mousemove", function (event) {
        if (!containerRef.current) return
        const [mx, my] = d3.pointer(event, containerRef.current)
        tooltip.style("top", `${my - 60}px`).style("left", `${Math.min(mx + 15, width - 200)}px`)
      })
      .on("mouseout", function (event, d) {
        d3.select(this).attr("opacity", d.depth === 0 ? 0.25 : 0.85).style("filter", "none")
        tooltip.style("visibility", "hidden")
      })
      .on("click", (event, d) => {
        event.stopPropagation()
        zoomToNode(d, true)
      })

    // Name label — always append with text, hide via display attr
    const labelName = cell
      .append("text")
      .attr("x", 5)
      .attr("y", 15)
      .attr("fill", "#ffffff")
      .attr("font-size", "11px")
      .attr("font-weight", "700")
      .attr("pointer-events", "none")
      .attr("display", "none") // hidden until zoomToNode evaluates size
      .text((d) => d.data.name)

    // Value label
    const labelValue = cell
      .append("text")
      .attr("x", 5)
      .attr("y", 28)
      .attr("fill", "rgba(255,255,255,0.7)")
      .attr("font-size", "10px")
      .attr("font-weight", "500")
      .attr("pointer-events", "none")
      .attr("display", "none")
      .text((d) => formatRef.current(d.value || 0))

    // Recompute which labels are visible given current zoom scales
    function updateLabels(
      xScale: d3.ScaleLinear<number, number>,
      yScale: d3.ScaleLinear<number, number>
    ) {
      labelName.attr("display", (d) => {
        const w = yScale(d.y1) - yScale(d.y0)
        const h = xScale(d.x1) - xScale(d.x0)
        return w >= 38 && h >= 16 ? null : "none"
      })
      labelValue.attr("display", (d) => {
        const w = yScale(d.y1) - yScale(d.y0)
        const h = xScale(d.x1) - xScale(d.x0)
        return w >= 52 && h >= 30 ? null : "none"
      })
    }

    let transitionTimeout: any = null;

    function zoomToNode(target: d3.HierarchyRectangularNode<IcicleNode>, animate = true) {
      if (transitionTimeout) {
        clearTimeout(transitionTimeout);
        transitionTimeout = null;
      }

      // Build breadcrumb path
      const pathNodes: d3.HierarchyRectangularNode<IcicleNode>[] = []
      const pathNames: string[] = []
      let curr: d3.HierarchyNode<IcicleNode> | null = target
      while (curr) {
        pathNodes.unshift(curr as d3.HierarchyRectangularNode<IcicleNode>)
        pathNames.unshift(curr.data.name)
        curr = curr.parent
      }

      activeFocusPathRef.current = pathNames
      setBreadcrumb(pathNodes)

      const xScale = d3.scaleLinear().domain([target.x0, target.x1]).range([0, height])
      const yScale = d3.scaleLinear().domain([target.y0, width]).range([0, width])

      if (animate) {
        // Hide labels during animation to avoid clutter
        labelName.attr("display", "none")
        labelValue.attr("display", "none")

        cell
          .transition()
          .duration(400)
          .attr("transform", (d) => `translate(${yScale(d.y0)},${xScale(d.x0)})`)

        rect
          .transition()
          .duration(400)
          .attr("width", (d) => Math.max(0, yScale(d.y1) - yScale(d.y0) - 1))
          .attr("height", (d) => Math.max(0, xScale(d.x1) - xScale(d.x0) - 1))

        // Update labels robustly after the transition completes
        transitionTimeout = setTimeout(() => {
          updateLabels(xScale, yScale)
        }, 400)
      } else {
        cell.attr("transform", (d) => `translate(${yScale(d.y0)},${xScale(d.x0)})`)
        rect
          .attr("width", (d) => Math.max(0, yScale(d.y1) - yScale(d.y0) - 1))
          .attr("height", (d) => Math.max(0, xScale(d.x1) - xScale(d.x0) - 1))
        updateLabels(xScale, yScale)
      }

      if (animate && onNodeClick && target.depth > 0) {
        onNodeClick(target.data)
      }
    }

    zoomFnRef.current = zoomToNode

    // Restore previous zoom level
    if (activeFocusPathRef.current.length > 0) {
      let targetNode: d3.HierarchyRectangularNode<IcicleNode> = root
      for (const name of activeFocusPathRef.current) {
        const found = (targetNode.children as d3.HierarchyRectangularNode<IcicleNode>[] | undefined)
          ?.find((c) => c.data.name === name)
        if (found) targetNode = found
        else break
      }
      zoomToNode(targetNode, false)
    } else {
      zoomToNode(root, false)
    }

    return () => {
      d3.select(containerRef.current).selectAll(".d3-icicle-tooltip").remove()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, height])

  const handleBreadcrumbClick = useCallback((node: d3.HierarchyRectangularNode<IcicleNode>) => {
    if (zoomFnRef.current) zoomFnRef.current(node, true)
  }, [])

  return (
    <div className="w-full flex flex-col space-y-2 relative" ref={containerRef}>
      {/* Breadcrumb */}
      <div className="flex items-center flex-wrap gap-1.5 text-xs bg-secondary p-2 rounded-xl border border-border">
        <span className="text-slate-500 font-medium uppercase text-[10px] tracking-widest mr-1">
          Hierarchy:
        </span>
        {breadcrumb.map((item, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && <span className="text-slate-400">/</span>}
            <button
              type="button"
              onClick={() => handleBreadcrumbClick(item)}
              className={`px-1.5 py-0.5 font-medium transition-colors ${
                idx === breadcrumb.length - 1
                  ? "bg-primary/20 text-primary"
                  : "text-slate-700 dark:text-slate-300 hover:bg-accent cursor-pointer"
              }`}
            >
              {item.data.name}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* SVG */}
      <div className="w-full overflow-hidden bg-card border border-border rounded-xl">
        <svg ref={svgRef} className="w-full block" />
      </div>
    </div>
  )
}
