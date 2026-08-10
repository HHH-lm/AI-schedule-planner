"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookMarked,
  CheckCircle2,
  Circle,
  MapPin,
  Sparkles,
} from "lucide-react";
import type { TimeBlock } from "@/lib/types";
import type { WeekDay } from "@/lib/date";
import { CATEGORIES } from "@/lib/categories";
import { minutesToHHMM } from "@/lib/date";
import { pointToGridSlot } from "@/lib/grid";
import {
  getTimelineFocusScroll,
  type TimelineFocusTarget,
} from "@/lib/timeline";

const HOUR_HEIGHT = 48;
const COL_WIDTH = 132;
const TIME_COL_W = 56;
const TOTAL_HEIGHT = HOUR_HEIGHT * 24;

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

interface Props {
  days: WeekDay[];
  blocks: TimeBlock[];
  obsidianVault?: string;
  focusTarget?: TimelineFocusTarget | null;
  onFocusHandled?: () => void;
  onUpdateBlock: (id: string, patch: Partial<TimeBlock>) => void;
  onToggleDone: (id: string) => void;
  onEditBlock: (block: TimeBlock) => void;
  onAddAt: (date: string, start: number) => void;
  onOpenObsidian?: (block: TimeBlock) => void;
}

export default function WeekTimeline({
  days,
  blocks,
  obsidianVault,
  focusTarget,
  onFocusHandled,
  onUpdateBlock,
  onToggleDone,
  onEditBlock,
  onAddAt,
  onOpenObsidian,
}: Props) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pendingDrag, setPendingDrag] = useState<PendingDrag | null>(null);
  const movedRef = useRef(false);
  const dragRef = useRef<DragState | null>(null);
  const previewRef = useRef<Preview | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [columnWidth, setColumnWidth] = useState(COL_WIDTH);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => {
      setColumnWidth(
        Math.max(COL_WIDTH, Math.floor((el.clientWidth - TIME_COL_W) / 7))
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
      const { left, top } = getTimelineFocusScroll({
        dayIndex,
        columnWidth,
        clientWidth: el.clientWidth,
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
        start: focusTarget.start,
        end: focusTarget.end,
        timeColumnWidth: TIME_COL_W,
        hourHeight: HOUR_HEIGHT,
      });
      el.scrollLeft = left;
      el.scrollTop = top;
      handledFocusRef.current = key;
      onFocusHandled?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [focusTarget, days, columnWidth, onFocusHandled]);

  const startDrag = (
    event: React.PointerEvent,
    block: TimeBlock,
    kind: DragState["kind"]
  ) => {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    movedRef.current = false;
    const next: DragState = {
      blockId: block.id,
      kind,
      startX: event.clientX,
      startY: event.clientY,
      originDate: block.date,
      originStart: block.start,
      originEnd: block.end,
      dayIndex: Math.max(
        0,
        Math.min(6, days.findIndex((d) => d.key === block.date))
      ),
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

  const handlePointerMove = (event: React.PointerEvent) => {
    const current = dragRef.current;
    if (!current) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    if (Math.abs(dx) + Math.abs(dy) > 6) movedRef.current = true;

    const deltaMinutes =
      Math.round((dy / HOUR_HEIGHT) * 4) * 15;
    const dayShift = Math.round(dx / columnWidth);
    const dayIndex = clamp(current.dayIndex + dayShift, 0, 6);

    if (current.kind === "move") {
      const start = current.originStart + deltaMinutes;
      const end = current.originEnd + deltaMinutes;
      const nextPreview: Preview = {
        blockId: current.blockId,
        date: days[dayIndex].key,
        start: clamp(start, 0, 1439),
        end: clamp(end, 15, 1440),
      };
      previewRef.current = nextPreview;
      setPreview(nextPreview);
    } else if (current.kind === "resize-end") {
      const nextPreview: Preview = {
        blockId: current.blockId,
        date: current.originDate,
        start: current.originStart,
        end: clamp(current.originEnd + deltaMinutes, current.originStart + 15, 1440),
      };
      previewRef.current = nextPreview;
      setPreview(nextPreview);
    } else {
      const nextPreview: Preview = {
        blockId: current.blockId,
        date: current.originDate,
        start: clamp(current.originStart + deltaMinutes, 0, current.originEnd - 15),
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
  };

  const cancelDrag = () => {
    dragRef.current = null;
    setDrag(null);
    setPreview(null);
    previewRef.current = null;
    movedRef.current = false;
  };

  const getPendingDropPosition = (event: React.DragEvent) => {
    const el = gridRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return pointToGridSlot(
      event.clientX,
      event.clientY,
      rect,
      columnWidth,
      days,
      HOUR_HEIGHT
    );
  };

  const handleGridClick = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-time-block]")) return;
    const el = gridRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const position = pointToGridSlot(
      event.clientX,
      event.clientY,
      rect,
      columnWidth,
      days,
      HOUR_HEIGHT
    );
    if (!position) return;
    onAddAt(position.date, position.start);
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
    });
    setPendingDrag(null);
  };

  return (
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
            className="sticky left-0 z-20 shrink-0 bg-canvas"
            style={{ width: TIME_COL_W, height: TOTAL_HEIGHT }}
          >
            {Array.from({ length: 24 }, (_, hour) => (
              <div
                key={hour}
                className="time-col-label"
                style={{ top: hour * HOUR_HEIGHT }}
              >
                {hour}:00
              </div>
            ))}
          </div>

          <div
            ref={gridRef}
            className="relative"
            style={{ width: columnWidth * 7, height: TOTAL_HEIGHT }}
            onDragOver={handlePendingDragOver}
            onDrop={handlePendingDrop}
            onClick={handleGridClick}
          >
            {Array.from({ length: 25 }, (_, hour) => (
              <div
                key={hour}
                className={`absolute left-0 right-0 border-t ${
                  hour % 3 === 0 ? "border-[#e0e0e0]" : "border-[#f0f0f0]"
                }`}
                style={{ top: hour * HOUR_HEIGHT }}
              />
            ))}
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
                  top: (nowMinutes / 60) * HOUR_HEIGHT,
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
                const top = (pendingDrag.start / 60) * HOUR_HEIGHT;
                return (
                  <div
                    className="pointer-events-none absolute rounded-[8px] border-2 border-dashed border-primary/70 bg-[rgba(0,102,204,0.08)] px-1.5 py-1"
                    style={{
                      left: dayIndex * columnWidth + 5,
                      width: columnWidth - 10,
                      top,
                      height: HOUR_HEIGHT,
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
              const dayIndex = days.findIndex((d) => d.key === block.date);
              if (dayIndex < 0) return null;
              const activePreview =
                preview && preview.blockId === block.id ? preview : null;
              const start = activePreview?.start ?? block.start;
              const end = activePreview?.end ?? block.end;
              const top = (start / 60) * HOUR_HEIGHT;
              const height = Math.max(
                22,
                ((end - start) / 60) * HOUR_HEIGHT
              );
              const meta = CATEGORIES[block.category];
              const dragging = drag?.blockId === block.id;
              const focused =
                focusTarget &&
                block.date === focusTarget.date &&
                start === focusTarget.start &&
                end === focusTarget.end;
              const hasObsidian = Boolean(
                block.obsidianVault || block.obsidianNote || obsidianVault
              );
              return (
                <div
                  key={block.id}
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
                  onPointerDown={(event) => startDrag(event, block, "move")}
                  onPointerMove={handlePointerMove}
                  onPointerUp={finishDrag}
                  onPointerCancel={cancelDrag}
                >
                  <div
                    className="resize-handle top-0"
                    onPointerDown={(event) =>
                      startDrag(event, block, "resize-start")
                    }
                  />
                  <div
                    className="resize-handle bottom-0"
                    onPointerDown={(event) =>
                      startDrag(event, block, "resize-end")
                    }
                  />
                  <div className="flex h-full min-h-0 flex-col justify-between gap-1 overflow-hidden px-1.5 py-1">
                    <div className="flex min-w-0 items-start justify-between gap-1">
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-medium tabular-nums leading-tight text-ink-muted-48">
                          {minutesToHHMM(start)}-{minutesToHHMM(end)}
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
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
