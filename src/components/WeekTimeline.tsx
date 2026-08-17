"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookMarked,
  CheckCircle2,
  Circle,
  ChevronUp,
  MapPin,
  Sparkles,
  X,
} from "lucide-react";
import type { TimeBlock } from "@/lib/types";
import type { WeekDay } from "@/lib/date";
import { CATEGORIES } from "@/lib/categories";
import { defaultRemindAtISO, minutesToHHMM } from "@/lib/date";
import type { TimelineFocusTarget } from "@/lib/timeline";
import {
  endDateKey,
  formatBlockRange,
  MINUTES_PER_DAY,
  splitBlockByDays,
} from "@/lib/blockTime";

const HOUR_HEIGHT = 120;
const COL_WIDTH = 132;
const TIME_COL_W = 56;
const LONG_PRESS_MS = 200;
const TOUCH_MOVE_CANCEL = 10;

interface CollapsedRange {
  start: number;
  end: number;
}

interface DragState {
  blockId: string;
  kind: "move" | "resize-start" | "resize-end";
  startX: number;
  startY: number;
  originDate: string;
  originStart: number;
  originEnd: number;
  dayIndex: number;
}

interface Preview {
  blockId: string;
  date: string;
  start: number;
  end: number;
}

interface PendingDrag {
  blockId: string;
  date: string;
  start: number;
}

interface PendingTouch {
  block: TimeBlock;
  kind: DragState["kind"];
  pointerId: number;
  target: HTMLElement;
  startX: number;
  startY: number;
  dayIndex: number;
  timer: number;
}

interface Props {
  days: WeekDay[];
  blocks: TimeBlock[];
  collapsedRanges: CollapsedRange[];
  onCollapsedRangesChange: (ranges: CollapsedRange[]) => void;
  batchMode: boolean;
  onBatchModeChange: (mode: boolean) => void;
  obsidianVault?: string;
  focusTarget?: TimelineFocusTarget | null;
  onFocusHandled?: () => void;
  onUpdateBlock: (id: string, patch: Partial<TimeBlock>) => void;
  onToggleDone: (id: string) => void;
  onEditBlock: (block: TimeBlock) => void;
  onAddAt: (date: string, start: number) => void;
  onOpenObsidian?: (block: TimeBlock) => void;
  onDeleteBlocks?: (ids: string[]) => void;
}

export default function WeekTimeline({
  days,
  blocks,
  collapsedRanges,
  onCollapsedRangesChange,
  batchMode,
  onBatchModeChange,
  obsidianVault,
  focusTarget,
  onFocusHandled,
  onUpdateBlock,
  onToggleDone,
  onEditBlock,
  onAddAt,
  onOpenObsidian,
  onDeleteBlocks,
}: Props) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pendingDrag, setPendingDrag] = useState<PendingDrag | null>(null);
  const movedRef = useRef(false);
  const pendingTouchRef = useRef<PendingTouch | null>(null);
  const dragTargetRef = useRef<HTMLElement | null>(null);
  const touchMoveLockRef = useRef<((event: TouchEvent) => void) | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const previewRef = useRef<Preview | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [columnWidth, setColumnWidth] = useState(COL_WIDTH);
  const [collapseDialog, setCollapseDialog] = useState<{
    start: string;
    end: string;
  } | null>(null);
  const [selectedBlocks, setSelectedBlocks] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!batchMode) setSelectedBlocks(new Set());
  }, [batchMode]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const minColWidth = el.clientWidth < 640 ? 88 : COL_WIDTH;
      setColumnWidth(
        Math.max(minColWidth, Math.floor((el.clientWidth - TIME_COL_W) / 7))
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const visibleRanges = useMemo(() => {
    const ranges: CollapsedRange[] = [{ start: 0, end: 1440 }];
    for (const cr of collapsedRanges) {
      for (let i = ranges.length - 1; i >= 0; i--) {
        const r = ranges[i];
        if (cr.start >= r.end || cr.end <= r.start) continue;
        ranges.splice(i, 1);
        if (r.start < cr.start) ranges.push({ start: r.start, end: cr.start });
        if (r.end > cr.end) ranges.push({ start: cr.end, end: r.end });
      }
    }
    ranges.sort((a, b) => a.start - b.start);
    return ranges;
  }, [collapsedRanges]);

  const totalHeight = useMemo(() => {
    const visibleMinutes = visibleRanges.reduce(
      (s, r) => s + (r.end - r.start),
      0
    );
    return (visibleMinutes / 60) * HOUR_HEIGHT;
  }, [visibleRanges]);

  const getVisibleOffset = useCallback(
    (minutes: number): number => {
      let offset = 0;
      for (const r of visibleRanges) {
        if (r.start >= minutes) break;
        offset += Math.min(r.end, minutes) - r.start;
      }
      return offset;
    },
    [visibleRanges]
  );

  const getWallClockFromVisible = useCallback(
    (visibleOffset: number): number => {
      let remaining = visibleOffset;
      for (const r of visibleRanges) {
        const span = r.end - r.start;
        if (remaining <= span) return r.start + remaining;
        remaining -= span;
      }
      return 1440;
    },
    [visibleRanges]
  );

  const mergeRanges = (ranges: CollapsedRange[]): CollapsedRange[] => {
    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    const merged: CollapsedRange[] = [];
    for (const range of sorted) {
      const last = merged[merged.length - 1];
      if (last && range.start <= last.end) {
        last.end = Math.max(last.end, range.end);
      } else {
        merged.push({ ...range });
      }
    }
    return merged;
  };

  const addCollapsedRange = (start: number, end: number) => {
    if (start >= end) return;
    const s = Math.max(0, Math.min(1439, start));
    const e = Math.max(s + 1, Math.min(1440, end));
    onCollapsedRangesChange(mergeRanges([...collapsedRanges, { start: s, end: e }]));
  };

  const scheduled = useMemo(
    () => blocks.filter((b) => b.status === "scheduled"),
    [blocks]
  );
  const pendingByDay = useMemo(() => {
    const map: Record<string, TimeBlock[]> = {};
    for (const block of blocks) {
      if (block.status !== "pending") continue;
      if (!map[block.date]) map[block.date] = [];
      map[block.date].push(block);
    }
    return map;
  }, [blocks]);

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayIndex = days.findIndex((day) => day.isToday);

  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

  const handledFocusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!focusTarget) {
      handledFocusRef.current = null;
      return;
    }
    const key = `${focusTarget.date}:${focusTarget.start}:${focusTarget.end}`;
    if (handledFocusRef.current === key) return;
    const el = containerRef.current;
    if (!el) return;
    const dayIndex = days.findIndex((day) => day.key === focusTarget.date);
    if (dayIndex < 0) return;
    const frame = requestAnimationFrame(() => {
      el.scrollIntoView({ block: "nearest" });
      const contentWidth = TIME_COL_W + columnWidth * 7;
      const dayLeft = TIME_COL_W + dayIndex * columnWidth;
      const focusEnd = Math.min(focusTarget.end, MINUTES_PER_DAY);
      const blockHeight = Math.max(
        22,
        ((focusEnd - focusTarget.start) / 60) * HOUR_HEIGHT
      );
      const left = clamp(
        dayLeft + columnWidth / 2 - el.clientWidth / 2,
        0,
        Math.max(0, contentWidth - el.clientWidth)
      );
      const top = clamp(
        getVisibleOffset(focusTarget.start) / 60 * HOUR_HEIGHT +
          blockHeight / 2 -
          el.clientHeight / 2,
        0,
        Math.max(0, el.scrollHeight - el.clientHeight)
      );
      el.scrollLeft = left;
      el.scrollTop = top;
      handledFocusRef.current = key;
      onFocusHandled?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [focusTarget, days, columnWidth, onFocusHandled, getVisibleOffset]);

  const beginDrag = (
    block: TimeBlock,
    kind: DragState["kind"],
    startX: number,
    startY: number,
    target: HTMLElement,
    pointerId: number,
    dayIndex: number
  ) => {
    target.setPointerCapture(pointerId);
    dragTargetRef.current = target;
    target.style.touchAction = "none";
    movedRef.current = false;
    const next: DragState = {
      blockId: block.id,
      kind,
      startX,
      startY,
      originDate: block.date,
      originStart: block.start,
      originEnd: block.end,
      dayIndex: Math.max(0, Math.min(6, dayIndex)),
    };
    dragRef.current = next;
    setDrag(next);
    const initialPreview: Preview = {
      blockId: block.id,
      date: block.date,
      start: block.start,
      end: block.end,
    };
    previewRef.current = initialPreview;
    setPreview(initialPreview);
  };

  const startDrag = (
    event: React.PointerEvent,
    block: TimeBlock,
    kind: DragState["kind"],
    dayIndex: number
  ) => {
    event.preventDefault();
    event.stopPropagation();
    beginDrag(
      block,
      kind,
      event.clientX,
      event.clientY,
      event.currentTarget as HTMLElement,
      event.pointerId,
      dayIndex
    );
  };

  const clearPendingTouch = () => {
    const pending = pendingTouchRef.current;
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingTouchRef.current = null;
  };

  const lockTouchScroll = () => {
    if (touchMoveLockRef.current) return;
    const handler = (event: TouchEvent) => event.preventDefault();
    touchMoveLockRef.current = handler;
    document.addEventListener("touchmove", handler, { passive: false });
  };

  const releaseTouchScroll = () => {
    if (!touchMoveLockRef.current) return;
    document.removeEventListener("touchmove", touchMoveLockRef.current);
    touchMoveLockRef.current = null;
  };

  const handlePointerDown = (
    event: React.PointerEvent,
    block: TimeBlock,
    kind: DragState["kind"],
    dayIndex: number
  ) => {
    if (event.pointerType === "mouse") {
      startDrag(event, block, kind, dayIndex);
      return;
    }
    event.stopPropagation();
    const pending: PendingTouch = {
      block,
      kind,
      pointerId: event.pointerId,
      target: event.currentTarget as HTMLElement,
      startX: event.clientX,
      startY: event.clientY,
      dayIndex,
      timer: 0,
    };
    pendingTouchRef.current = pending;
    pending.timer = window.setTimeout(() => {
      if (pendingTouchRef.current !== pending) return;
      pendingTouchRef.current = null;
      lockTouchScroll();
      beginDrag(
        pending.block,
        pending.kind,
        pending.startX,
        pending.startY,
        pending.target,
        pending.pointerId,
        pending.dayIndex
      );
    }, LONG_PRESS_MS);
  };

    const handlePointerMove = (event: React.PointerEvent) => {
      const pending = pendingTouchRef.current;
      if (pending) {
        const dx = event.clientX - pending.startX;
        const dy = event.clientY - pending.startY;
        if (Math.abs(dx) + Math.abs(dy) > TOUCH_MOVE_CANCEL) {
          clearPendingTouch();
        }
        return;
      }

      const current = dragRef.current;
      if (!current) return;
      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;
      if (Math.abs(dx) + Math.abs(dy) > 6) movedRef.current = true;

      const rect = gridRef.current?.getBoundingClientRect();
      const gridTop = rect?.top ?? 0;
      const startVisibleOffset = ((current.startY - gridTop) / HOUR_HEIGHT) * 60;
      const currentVisibleOffset = ((event.clientY - gridTop) / HOUR_HEIGHT) * 60;
      const deltaMinutes =
        Math.round(
          (getWallClockFromVisible(currentVisibleOffset) -
            getWallClockFromVisible(startVisibleOffset)) /
            15
        ) * 15;
      const dayShift = Math.round(dx / columnWidth);
      const dayIndex = clamp(current.dayIndex + dayShift, 0, 6);

    if (current.kind === "move") {
      const duration = current.originEnd - current.originStart;
      const start = clamp(current.originStart + deltaMinutes, 0, 1439);
      let end = start + duration;
      if (current.originEnd <= MINUTES_PER_DAY) {
        end = Math.min(MINUTES_PER_DAY, end);
      }
      end = Math.max(start + 15, end);
      const nextPreview: Preview = {
        blockId: current.blockId,
        date: days[dayIndex].key,
        start,
        end,
      };
      previewRef.current = nextPreview;
      setPreview(nextPreview);
    } else if (current.kind === "resize-end") {
      const nextPreview: Preview = {
        blockId: current.blockId,
        date: current.originDate,
        start: current.originStart,
        end: Math.max(
          current.originStart + 15,
          Math.min(14 * MINUTES_PER_DAY, current.originEnd + deltaMinutes)
        ),
      };
      previewRef.current = nextPreview;
      setPreview(nextPreview);
    } else {
      const nextPreview: Preview = {
        blockId: current.blockId,
        date: current.originDate,
        start: clamp(
          current.originStart + deltaMinutes,
          0,
          Math.min(1439, current.originEnd - 15)
        ),
        end: current.originEnd,
      };
      previewRef.current = nextPreview;
      setPreview(nextPreview);
    }
  };

  const finishDrag = () => {
    const current = dragRef.current;
    if (!current) return;
    const currentPreview = previewRef.current;
    if (currentPreview && movedRef.current) {
      onUpdateBlock(currentPreview.blockId, {
        date: currentPreview.date,
        start: currentPreview.start,
        end: currentPreview.end,
      });
    } else if (currentPreview && !movedRef.current) {
      const block = blocks.find((b) => b.id === currentPreview.blockId);
      if (block) onEditBlock(block);
    }
    dragRef.current = null;
    setDrag(null);
    setPreview(null);
    previewRef.current = null;
    movedRef.current = false;
    if (dragTargetRef.current) {
      dragTargetRef.current.style.touchAction = "";
      dragTargetRef.current = null;
    }
    releaseTouchScroll();
  };

  const cancelDrag = () => {
    dragRef.current = null;
    setDrag(null);
    setPreview(null);
    previewRef.current = null;
    movedRef.current = false;
    if (dragTargetRef.current) {
      dragTargetRef.current.style.touchAction = "";
      dragTargetRef.current = null;
    }
    releaseTouchScroll();
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    const pending = pendingTouchRef.current;
    if (pending) {
      clearPendingTouch();
      if (!movedRef.current) {
        const block = blocks.find((b) => b.id === pending.block.id);
        if (block) onEditBlock(block);
      }
      return;
    }
    finishDrag();
  };

  const handlePointerCancel = () => {
    clearPendingTouch();
    cancelDrag();
  };

  useEffect(() => {
    return () => {
      if (pendingTouchRef.current) {
        window.clearTimeout(pendingTouchRef.current.timer);
        pendingTouchRef.current = null;
      }
      if (touchMoveLockRef.current) {
        document.removeEventListener("touchmove", touchMoveLockRef.current);
        touchMoveLockRef.current = null;
      }
    };
  }, []);

  const getPendingDropPosition = (event: React.DragEvent) => {
    const el = gridRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const dayIndex = Math.max(
      0,
      Math.min(6, Math.floor((event.clientX - rect.left) / columnWidth))
    );
    const day = days[dayIndex];
    if (!day) return null;
    const visibleOffset = ((event.clientY - rect.top) / HOUR_HEIGHT) * 60;
    const start = Math.max(
      0,
      Math.min(
        1439,
        Math.round(getWallClockFromVisible(visibleOffset) / 15) * 15
      )
    );
    return { date: day.key, start };
  };

  const handleGridClick = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-time-block]")) return;
    const el = gridRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dayIndex = Math.max(
      0,
      Math.min(6, Math.floor((event.clientX - rect.left) / columnWidth))
    );
    const day = days[dayIndex];
    if (!day) return;
    const visibleOffset = ((event.clientY - rect.top) / HOUR_HEIGHT) * 60;
    const start = Math.max(
      0,
      Math.min(
        1439,
        Math.round(getWallClockFromVisible(visibleOffset) / 15) * 15
      )
    );
    const position = { date: day.key, start };
    if (!position) return;
    onAddAt(position.date, position.start);
  };

  const handleTimeColClick = () => {
    setCollapseDialog({ start: "00:00", end: "08:00" });
  };

  const timeColLongPressRef = useRef<number | null>(null);
  const handleTimeColPointerDown = (event: React.PointerEvent) => {
    if (event.pointerType !== "touch") return;
    timeColLongPressRef.current = window.setTimeout(() => {
      setCollapseDialog({ start: "00:00", end: "08:00" });
    }, 500);
  };
  const handleTimeColPointerUp = () => {
    if (timeColLongPressRef.current !== null) {
      window.clearTimeout(timeColLongPressRef.current);
      timeColLongPressRef.current = null;
    }
  };
  const handleTimeColPointerLeave = () => {
    handleTimeColPointerUp();
  };

  const handlePendingDragOver = (event: React.DragEvent) => {
    if (!pendingDrag) return;
    const position = getPendingDropPosition(event);
    if (!position || position.date !== pendingDrag.date) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setPendingDrag((prev) =>
      prev && prev.date === position.date && prev.start === position.start
        ? prev
        : { blockId: pendingDrag.blockId, ...position }
    );
  };

  const handlePendingDrop = (event: React.DragEvent) => {
    if (!pendingDrag) return;
    const position = getPendingDropPosition(event);
    if (!position || position.date !== pendingDrag.date) return;
    event.preventDefault();
    onUpdateBlock(pendingDrag.blockId, {
      date: position.date,
      start: position.start,
      end: Math.min(1440, position.start + 60),
      status: "scheduled",
      remindAt: defaultRemindAtISO(position.date, position.start),
    });
    setPendingDrag(null);
  };

  return (
    <>
      <div
        ref={containerRef}
        className="timeline-shell thin-scroll"
      >
      <div style={{ width: TIME_COL_W + columnWidth * 7 }}>
        <div className="timeline-header">
          <div className="w-14 shrink-0" />
          {days.map((day) => {
            const pending = pendingByDay[day.key] ?? [];
            return (
              <div
                key={day.key}
                className="timeline-day"
                style={{ width: columnWidth }}
              >
                <div className="flex flex-col items-center gap-1">
                  <span
                    className={`inline-flex items-center justify-center text-xs font-semibold ${
                      day.isToday ? "today-chip" : "text-ink-muted-80"
                    }`}
                  >
                    {day.label}
                  </span>
                  {pending.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-1">
                      {pending.map((block) => (
                        <button
                          key={block.id}
                          type="button"
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData("text/plain", block.id);
                            event.dataTransfer.effectAllowed = "move";
                            setPendingDrag({
                              blockId: block.id,
                              date: block.date,
                              start: block.start,
                            });
                          }}
                          onDragEnd={() => setPendingDrag(null)}
                          onClick={() => onEditBlock(block)}
                          className="pending-chip !py-1 text-[10px]"
                          title="待排期，点击分配时间"
                        >
                          <Sparkles size={10} />
                          <span className="truncate">{block.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex">
          <div
            className="sticky left-0 z-20 shrink-0 cursor-pointer bg-canvas hover:bg-canvas-parchment group"
            style={{ width: TIME_COL_W, height: totalHeight }}
            title="点击折叠空白时间区间"
            onClick={handleTimeColClick}
            onPointerDown={handleTimeColPointerDown}
            onPointerUp={handleTimeColPointerUp}
            onPointerLeave={handleTimeColPointerLeave}
          >
            <div className="flex items-center justify-center gap-0.5 border-b border-divider-soft px-1 py-1 opacity-0 transition group-hover:opacity-100">
              <ChevronUp size={11} className="text-ink-muted-48" />
              <span className="text-[9px] font-medium text-ink-muted-48 select-none">折叠</span>
            </div>
            {Array.from({ length: 24 }, (_, hour) => {
              const minutes = hour * 60;
              const top = getVisibleOffset(minutes) / 60 * HOUR_HEIGHT;
              const nextTop = getVisibleOffset(minutes + 60) / 60 * HOUR_HEIGHT;
              if (top === nextTop) return null;
              return (
                <div key={hour} className="time-col-label" style={{ top }}>
                  {hour}:00
                </div>
              );
            })}
          </div>

          <div
            ref={gridRef}
            className="relative"
            style={{ width: columnWidth * 7, height: totalHeight }}
            onDragOver={handlePendingDragOver}
            onDrop={handlePendingDrop}
            onClick={handleGridClick}
          >
            {Array.from({ length: 25 }, (_, hour) => {
              const minutes = hour * 60;
              const top = getVisibleOffset(minutes) / 60 * HOUR_HEIGHT;
              const nextTop = hour < 24
                ? getVisibleOffset(minutes + 60) / 60 * HOUR_HEIGHT
                : top;
              if (hour < 24 && top === nextTop) return null;
              return (
                <div
                  key={hour}
                  className={`absolute left-0 right-0 border-t ${
                    hour % 3 === 0 ? "border-[#e0e0e0]" : "border-[#f0f0f0]"
                  }`}
                  style={{ top }}
                />
              );
            })}
            {todayIndex >= 0 && (
              <div
                className="absolute bottom-0 top-0 bg-[rgba(0,102,204,0.04)]"
                style={{
                  left: todayIndex * columnWidth,
                  width: columnWidth,
                }}
              />
            )}
            {days.map((_, index) => (
              <div
                key={index}
                className="absolute bottom-0 top-0 border-l border-[#f0f0f0]"
                style={{ left: index * columnWidth }}
              />
            ))}
            {todayIndex >= 0 && (
              <div
                className="pointer-events-none absolute z-10"
                style={{
                  left: todayIndex * columnWidth,
                  width: columnWidth,
                  top: getVisibleOffset(nowMinutes) / 60 * HOUR_HEIGHT,
                }}
                >
                <div className="relative border-t-2 border-primary">
                  <span className="absolute -top-2.5 left-1 rounded-[5px] bg-primary px-1 py-px text-[9px] font-medium leading-tight text-white">
                    现在
                  </span>
                </div>
              </div>
            )}

            {pendingDrag &&
              (() => {
                const source = blocks.find(
                  (block) => block.id === pendingDrag.blockId
                );
                const dayIndex = days.findIndex(
                  (day) => day.key === pendingDrag.date
                );
                if (!source || dayIndex < 0) return null;
                const meta = CATEGORIES[source.category];
                const ps = pendingDrag.start;
                const top = getVisibleOffset(ps) / 60 * HOUR_HEIGHT;
                const height = Math.max(22, (getVisibleOffset(Math.min(1440, ps + 60)) - getVisibleOffset(ps)) / 60 * HOUR_HEIGHT);
                return (
                  <div
                    className="pointer-events-none absolute rounded-[8px] border-2 border-dashed border-primary/70 bg-[rgba(0,102,204,0.08)] px-1.5 py-1"
                    style={{
                      left: dayIndex * columnWidth + 5,
                      width: columnWidth - 10,
                      top,
                      height,
                    }}
                  >
                    <div className="truncate text-xs font-semibold text-primary">
                      {source.name}
                    </div>
                    <div className="text-[10px] tabular-nums leading-tight text-primary">
                      {minutesToHHMM(pendingDrag.start)}-
                      {minutesToHHMM(Math.min(1440, pendingDrag.start + 60))}
                    </div>
                  </div>
                );
              })()}

            {scheduled.map((block) => {
              const activePreview =
                preview && preview.blockId === block.id ? preview : null;
              const display = {
                date: activePreview?.date ?? block.date,
                start: activePreview?.start ?? block.start,
                end: activePreview?.end ?? block.end,
              };
              const segments = splitBlockByDays(display);
              const meta = CATEGORIES[block.category];
              const dragging = drag?.blockId === block.id;
              const hasObsidian = Boolean(
                block.obsidianVault || block.obsidianNote || obsidianVault
              );
              const blockRangeLabel = formatBlockRange(display);
              const batchCheckbox =
                batchMode
                  ? (
                      <div
                        className={
                          "h-[13px] w-[13px] shrink-0 min-w-[13px] min-h-[13px] flex-none cursor-pointer rounded-[3px] border " +
                          (selectedBlocks.has(block.id)
                            ? "border-primary bg-primary"
                            : "border-ink-muted-48 bg-transparent")
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedBlocks((prev) => {
                            const next = new Set(prev);
                            if (next.has(block.id)) next.delete(block.id);
                            else next.add(block.id);
                            return next;
                          });
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onPointerUp={(e) => e.stopPropagation()}
                      >
                        {selectedBlocks.has(block.id) && (
                          <svg viewBox="0 0 13 13" className="h-full w-full">
                            <path d="M3.5 7l2.5 2.5L9.5 3.5" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    )
                  : null;
              return segments.map((segment) => {
                const dayIndex = days.findIndex(
                  (day) => day.key === segment.dateKey
                );
                if (dayIndex < 0) return null;
                const top =
                  getVisibleOffset(segment.start) / 60 * HOUR_HEIGHT;
                const height = Math.max(
                  22,
                  (getVisibleOffset(segment.end) -
                    getVisibleOffset(segment.start)) /
                    60 *
                    HOUR_HEIGHT
                );
                const focused =
                  segment.isStart &&
                  focusTarget &&
                  block.date === focusTarget.date &&
                  display.start === focusTarget.start &&
                  display.end === focusTarget.end;
                return (
                <div
                  key={`${block.id}:${segment.dateKey}`}
                  data-time-block
                  className={`time-block-card ${meta.bg} ${meta.border} ${
                    block.done ? "done" : ""
                  } ${
                    dragging
                      ? "dragging"
                      : focused
                        ? "focused"
                        : ""
                  }`}
                  style={{
                    left: dayIndex * columnWidth + 5,
                    width: columnWidth - 10,
                    top,
                    height,
                  }}
                  onPointerDown={(event) => {
                    if (batchMode) {
                      setSelectedBlocks((prev) => {
                        const next = new Set(prev);
                        if (next.has(block.id)) next.delete(block.id);
                        else next.add(block.id);
                        return next;
                      });
                      return;
                    }
                    handlePointerDown(event, block, "move", dayIndex);
                  }}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerCancel}
                >
                  {segment.isStart && batchCheckbox && (
                    <div className="absolute bottom-1 right-[8.5px] z-10">
                      {batchCheckbox}
                    </div>
                  )}
                  {segment.isStart && (
                    <div
                      className="resize-handle top-0"
                      onPointerDown={(event) => {
                        if (batchMode) return;
                        handlePointerDown(event, block, "resize-start", dayIndex);
                      }}
                    />
                  )}
                  {segment.isEnd && (
                    <div
                      className="resize-handle bottom-0"
                      onPointerDown={(event) => {
                        if (batchMode) return;
                        handlePointerDown(event, block, "resize-end", dayIndex);
                      }}
                    />
                  )}
                  {height < 36 ? (
                    <div className="flex h-full min-h-0 items-start gap-1 overflow-hidden px-1">
                      <div className="min-w-0 flex-1 truncate text-xs font-semibold leading-tight text-ink">
                        {block.name}
                      </div>
                      <button
                        type="button"
                        title={block.done ? "标记未完成" : "标记完成"}
                        onPointerDown={(event) => event.stopPropagation()}
                        onPointerUp={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleDone(block.id);
                        }}
                        className="h-4 w-4 shrink-0 flex items-center justify-center rounded-full border-0 bg-transparent text-ink-muted-48 cursor-pointer"
                      >
                        {block.done ? (
                          <CheckCircle2
                            size={15}
                            className="text-primary"
                          />
                        ) : (
                          <Circle size={15} className="text-ink-muted-48" />
                        )}
                      </button>
                    </div>
                  ) : height < 42 ? (
                    <div className="flex h-full min-h-0 flex-col justify-start gap-0 overflow-hidden px-1.5 py-0.5">
                      <div className="flex items-center justify-between gap-1">
                        <div className="text-[10px] font-medium tabular-nums leading-tight text-ink-muted-48">
                          {blockRangeLabel}
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <button
                            type="button"
                            title={block.done ? "标记未完成" : "标记完成"}
                            onPointerDown={(event) => event.stopPropagation()}
                            onPointerUp={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              onToggleDone(block.id);
                            }}
                            className="icon-btn-plain !h-6 !w-6 shrink-0"
                          >
                          {block.done ? (
                            <CheckCircle2
                              size={15}
                              className="text-primary"
                            />
                          ) : (
                            <Circle size={15} className="text-ink-muted-48" />
                          )}
                            </button>
                          </div>
                        </div>
                      <div className="truncate text-xs font-semibold leading-tight text-ink">
                        {block.name}
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full min-h-0 flex-col justify-between gap-1 overflow-hidden px-1.5 py-1">
                      <div className="flex min-w-0 items-start justify-between gap-1">
                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] font-medium tabular-nums leading-tight text-ink-muted-48">
                            {blockRangeLabel}
                          </div>
                          <div className="truncate text-xs font-semibold leading-tight text-ink">
                            {block.name}
                          </div>
                          {block.location && (
                            <div className="mt-0.5 flex items-center gap-0.5 text-[10px] leading-tight text-ink-muted-48">
                              <MapPin size={10} className="shrink-0" />
                              <span className="truncate">{block.location}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          {hasObsidian && (
                            <button
                              type="button"
                              title="打开 Obsidian"
                              onPointerDown={(event) => event.stopPropagation()}
                              onPointerUp={(event) => event.stopPropagation()}
                              onClick={(event) => {
                                event.stopPropagation();
                                onOpenObsidian?.(block);
                              }}
                              className="icon-btn-plain !h-6 !w-6"
                            >
                              <BookMarked size={13} className="text-ink-muted-48" />
                            </button>
                          )}
                          <button
                            type="button"
                            title={block.done ? "标记未完成" : "标记完成"}
                            onPointerDown={(event) => event.stopPropagation()}
                            onPointerUp={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              onToggleDone(block.id);
                            }}
                            className="icon-btn-plain !h-6 !w-6"
                          >
                            {block.done ? (
                              <CheckCircle2
                                size={15}
                                className="text-primary"
                              />
                            ) : (
                              <Circle size={15} className="text-ink-muted-48" />
                            )}
                          </button>
                        </div>
                      </div>

                    </div>
                  )}
                </div>
              );
              });
            })}
         </div>
        </div>
      </div>
      </div>


      {batchMode && (
        <div className="sticky bottom-0 z-30 flex items-center justify-center gap-4 border-t border-divider-soft bg-canvas px-4 py-3">
          <span className="text-sm text-ink-muted-48">已选 {selectedBlocks.size} 项</span>
          <button
            type="button"
            onClick={() => {
              onDeleteBlocks?.(Array.from(selectedBlocks));
              onBatchModeChange(false);
              setSelectedBlocks(new Set());
            }}
            disabled={selectedBlocks.size === 0}
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            删除选中
          </button>
          <button
            type="button"
            onClick={() => {
              onBatchModeChange(false);
              setSelectedBlocks(new Set());
            }}
            className="rounded-lg bg-canvas-parchment px-4 py-1.5 text-sm font-medium text-ink hover:bg-divider-soft"
          >
            取消
          </button>
        </div>
      )}

      {collapseDialog && (
        <div
          className="modal-backdrop"
          onClick={() => setCollapseDialog(null)}
        >
          <div
            className="modal-card max-w-sm"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="modal-title">折叠时间区间</h3>
              <button
                type="button"
                onClick={() => setCollapseDialog(null)}
                className="icon-btn-plain"
                aria-label="关闭"
              >
                <X size={16} />
              </button>
            </div>
            <div className="modal-body space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">开始时间</label>
                  <input
                    type="time"
                    className="input-rect"
                    value={collapseDialog.start}
                    onChange={(event) =>
                      setCollapseDialog({
                        ...collapseDialog,
                        start: event.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="field-label">结束时间</label>
                  <input
                    type="time"
                    className="input-rect"
                    value={collapseDialog.end}
                    onChange={(event) =>
                      setCollapseDialog({
                        ...collapseDialog,
                        end: event.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="flex justify-between gap-3">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    onCollapsedRangesChange([]);
                    setCollapseDialog(null);
                  }}
                >
                  重置所有折叠
                </button>
                <button
                  type="button"
                  className="btn-primary-pill"
                  onClick={() => {
                    const [sh, sm] = collapseDialog.start.split(":").map(Number);
                    const [eh, em] = collapseDialog.end.split(":").map(Number);
                    if (
                      Number.isFinite(sh) &&
                      Number.isFinite(sm) &&
                      Number.isFinite(eh) &&
                      Number.isFinite(em)
                    ) {
                      addCollapsedRange(sh * 60 + sm, eh * 60 + em);
                    }
                    setCollapseDialog(null);
                  }}
                >
                  确认折叠
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
