export interface TimelineFocusTarget {
  date: string;
  start: number;
  end: number;
}

export interface TimelineFocusMetrics {
  dayIndex: number;
  columnWidth: number;
  clientWidth: number;
  clientHeight: number;
  scrollHeight: number;
  start: number;
  end: number;
  timeColumnWidth: number;
  hourHeight: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getTimelineFocusScroll(
  metrics: TimelineFocusMetrics
): { left: number; top: number } {
  const contentWidth = metrics.timeColumnWidth + metrics.columnWidth * 7;
  const dayLeft = metrics.timeColumnWidth + metrics.dayIndex * metrics.columnWidth;
  const blockHeight = Math.max(
    22,
    ((metrics.end - metrics.start) / 60) * metrics.hourHeight
  );
  const left = clamp(
    dayLeft + metrics.columnWidth / 2 - metrics.clientWidth / 2,
    0,
    Math.max(0, contentWidth - metrics.clientWidth)
  );
  const top = clamp(
    (metrics.start / 60) * metrics.hourHeight +
      blockHeight / 2 -
      metrics.clientHeight / 2,
    0,
    Math.max(0, metrics.scrollHeight - metrics.clientHeight)
  );
  return { left, top };
}
