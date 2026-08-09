export interface GridRect {
  left: number;
  top: number;
}

export function pointToGridSlot(
  clientX: number,
  clientY: number,
  rect: GridRect,
  columnWidth: number,
  days: Array<{ key: string }>,
  hourHeight = 48
): { date: string; start: number } | null {
  const dayIndex = Math.max(
    0,
    Math.min(6, Math.floor((clientX - rect.left) / columnWidth))
  );
  const day = days[dayIndex];
  if (!day) return null;
  const start = Math.max(
    0,
    Math.min(
      1439,
      Math.round(((clientY - rect.top) / hourHeight) * 4) * 15
    )
  );
  return { date: day.key, start };
}
