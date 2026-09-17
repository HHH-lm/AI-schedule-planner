interface PlanningResultSummary {
  added: number;
  blockedCount: number;
  deferredCount: number;
  message?: string | null;
}

export function planningFeedback(result: PlanningResultSummary): string {
  const parts: string[] = [];
  if (result.added > 0) {
    parts.push(`AI 规划完成：新增 ${result.added} 个时间块`);
  }
  if (result.deferredCount > 0) {
    parts.push(`${result.deferredCount} 个子任务截止较远，暂未安排`);
  }
  if (result.blockedCount > 0) {
    parts.push(`${result.blockedCount} 个子任务未找到合适时段`);
  }
  if (result.message) parts.push(result.message);
  return parts.join("；") || "AI 没有生成新的时间块，请调整任务或已有安排后重试";
}
