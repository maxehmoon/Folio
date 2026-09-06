"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type HighlightPosition = {
  animate: boolean
  height: number
  visible: boolean
  width: number
  x: number
  y: number
}

const hiddenPosition: HighlightPosition = {
  animate: false,
  height: 0,
  visible: false,
  width: 0,
  x: 0,
  y: 0,
}

function useMovingOptionHighlight<T extends HTMLElement>(selector: string) {
  const [container, setContainer] = React.useState<T | null>(null)
  const activeItemRef = React.useRef<HTMLElement>(null)
  const frameRef = React.useRef<number>(null)
  const hasMeasuredRef = React.useRef(false)
  const [position, setPosition] = React.useState(hiddenPosition)
  const containerRef = React.useCallback((node: T | null) => {
    setContainer(node)
  }, [])

  React.useLayoutEffect(() => {
    if (!container) return
    const currentContainer = container
    hasMeasuredRef.current = false

    function measure(item?: HTMLElement | null) {
      const target =
        item ?? currentContainer.querySelector<HTMLElement>(selector)
      if (!target) {
        if (activeItemRef.current) {
          resizeObserver.unobserve(activeItemRef.current)
        }
        activeItemRef.current = null
        hasMeasuredRef.current = false
        setPosition((current) =>
          current.visible ? { ...current, visible: false } : current,
        )
        return
      }

      if (activeItemRef.current !== target) {
        if (activeItemRef.current) {
          resizeObserver.unobserve(activeItemRef.current)
        }
        activeItemRef.current = target
        resizeObserver.observe(target)
      }
      const containerRect = currentContainer.getBoundingClientRect()
      const itemRect = target.getBoundingClientRect()
      const containerWidth = currentContainer.offsetWidth
      const containerHeight = currentContainer.offsetHeight
      const itemWidth = target.offsetWidth
      const itemHeight = target.offsetHeight

      if (
        !containerWidth ||
        !containerHeight ||
        !itemWidth ||
        !itemHeight ||
        !containerRect.width ||
        !containerRect.height
      ) {
        hasMeasuredRef.current = false
        setPosition((current) =>
          current.visible ? { ...current, visible: false } : current,
        )
        return
      }

      // Opening animations can scale the entire menu. Use layout dimensions for
      // the highlight and undo that scale when converting viewport coordinates.
      const scaleX = containerRect.width / containerWidth
      const scaleY = containerRect.height / containerHeight
      const animate = hasMeasuredRef.current
      hasMeasuredRef.current = true

      setPosition({
        animate,
        height: itemHeight,
        visible: true,
        width: itemWidth,
        x:
          (itemRect.left - containerRect.left) / scaleX +
          currentContainer.scrollLeft +
          itemWidth / 2,
        y:
          (itemRect.top - containerRect.top) / scaleY +
          currentContainer.scrollTop +
          itemHeight / 2,
      })
    }

    function scheduleMeasure() {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null
        measure()
      })
    }

    const observer = new MutationObserver(scheduleMeasure)
    observer.observe(currentContainer, {
      attributeFilter: [
        "data-highlighted",
        "data-selected",
        "data-side",
        "data-state",
      ],
      attributes: true,
      subtree: true,
    })

    const resizeObserver = new ResizeObserver(() => measure(activeItemRef.current))
    resizeObserver.observe(currentContainer)
    currentContainer.addEventListener("scroll", scheduleMeasure, true)
    window.addEventListener("resize", scheduleMeasure)
    measure()

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      hasMeasuredRef.current = false
      observer.disconnect()
      resizeObserver.disconnect()
      currentContainer.removeEventListener("scroll", scheduleMeasure, true)
      window.removeEventListener("resize", scheduleMeasure)
    }
  }, [container, selector])

  return { containerRef, position }
}

function MovingOptionHighlight({
  className,
  position,
}: {
  className?: string
  position: HighlightPosition
}) {
  return (
    <span
      aria-hidden="true"
      data-slot="moving-option-highlight"
      className={cn(
        "pointer-events-none absolute top-0 left-0 z-0 rounded-[14px] bg-accent opacity-0",
        position.animate &&
          "motion-safe:transition-[transform,width,height,opacity] motion-safe:duration-100 motion-safe:ease-out",
        position.visible && "opacity-100",
        className,
      )}
      style={{
        height: position.height,
        transform: `translate3d(${position.x}px, ${position.y}px, 0) translate(-50%, -50%)`,
        width: position.width,
      }}
    />
  )
}

export { MovingOptionHighlight, useMovingOptionHighlight }
