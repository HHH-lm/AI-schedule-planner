import { uid } from "./storage";
import type { Subtask, Task, TimeBlock } from "./types";

export interface BlockToTaskLink {
  taskId?: string;
  subtaskId?: string;
  blockName: string;
  previousBlockName?: string;
}

function sameName(left: string, right: string): boolean {
  return (
    left.trim().toLocaleLowerCase().replace(/\s+/g, "") ===
    right.trim().toLocaleLowerCase().replace(/\s+/g, "")
  );
}

function findSubtask(
  task: Task,
  name: string,
  loose: boolean
): Subtask | undefined {
  const exact = task.subtasks.find((sub) => sameName(sub.name, name));
  if (exact || !loose) return exact;
  return task.subtasks.find(
    (sub) => sub.name.includes(name) || name.includes(sub.name)
  );
}

function updateSubtaskName(
  tasks: Task[],
  ownerTaskId: string,
  subtaskId: string,
  name: string
): Task[] {
  return tasks.map((task) =>
    task.id === ownerTaskId
      ? {
          ...task,
          subtasks: task.subtasks.map((sub) =>
            sub.id === subtaskId ? { ...sub, name } : sub
          ),
        }
      : task
  );
}

/**
 * Syncs a time block's completion state to its owning subtask.
 * Falls back from a stale or missing subtaskId to the block's task and
 * name, and returns the resolved subtaskId so the block can be relinked.
 */
export function syncBlockDoneToSubtask(
  tasks: Task[],
  block: Pick<TimeBlock, "taskId" | "subtaskId" | "name">,
  done: boolean
): { tasks: Task[]; subtaskId?: string } {
  if (block.subtaskId) {
    const owner = tasks.find((task) =>
      task.subtasks.some((sub) => sub.id === block.subtaskId)
    );
    if (owner) {
      return {
        tasks: tasks.map((task) =>
          task.id === owner.id
            ? {
                ...task,
                subtasks: task.subtasks.map((sub) =>
                  sub.id === block.subtaskId ? { ...sub, done } : sub
                ),
              }
            : task
        ),
        subtaskId: block.subtaskId,
      };
    }
  }

  const candidateTasks = block.taskId
    ? tasks.filter((task) => task.id === block.taskId)
    : tasks;
  for (const task of candidateTasks) {
    const matched = findSubtask(task, block.name, true);
    if (!matched) continue;
    return {
      tasks: tasks.map((item) =>
        item.id === task.id
          ? {
              ...item,
              subtasks: item.subtasks.map((sub) =>
                sub.id === matched.id ? { ...sub, done } : sub
              ),
            }
          : item
      ),
      subtaskId: matched.id,
    };
  }

  return { tasks, subtaskId: undefined };
}

/**
 * Keeps the task board's subtask list in sync when a time block is saved.
 * A missing subtaskId is recovered from the previous block name so renames
 * update the matching subtask instead of silently creating a duplicate.
 */
export function syncBlockToTask(
  tasks: Task[],
  link: BlockToTaskLink
): { tasks: Task[]; subtaskId?: string } {
  if (link.subtaskId) {
    const owner = tasks.find((task) =>
      task.subtasks.some((sub) => sub.id === link.subtaskId)
    );
    const ownerId = owner?.id ?? link.taskId;
    if (ownerId) {
      return {
        tasks: updateSubtaskName(tasks, ownerId, link.subtaskId, link.blockName),
        subtaskId: link.subtaskId,
      };
    }
    return { tasks, subtaskId: link.subtaskId };
  }

  if (!link.taskId) return { tasks, subtaskId: undefined };

  const task = tasks.find((item) => item.id === link.taskId);
  if (!task) return { tasks, subtaskId: undefined };

  const previous = link.previousBlockName
    ? findSubtask(task, link.previousBlockName, true)
    : undefined;
  if (previous) {
    return {
      tasks: updateSubtaskName(tasks, task.id, previous.id, link.blockName),
      subtaskId: previous.id,
    };
  }

  const sameNewName = findSubtask(task, link.blockName, false);
  if (sameNewName) {
    return { tasks, subtaskId: sameNewName.id };
  }

  const newSub: Subtask = { id: uid(), name: link.blockName, done: false };
  return {
    tasks: tasks.map((item) =>
      item.id === task.id
        ? { ...item, subtasks: [...item.subtasks, newSub] }
        : item
    ),
    subtaskId: newSub.id,
  };
}

/**
 * Combined save-path sync used when a time block is saved from the modal:
 * establishes/repairs the subtask link like syncBlockToTask, then mirrors
 * the block's saved completion state onto the owning subtask so checking
 * "已完成" during creation reaches the task board.
 */
export function syncBlockSaveToTasks(
  tasks: Task[],
  link: BlockToTaskLink & { done: boolean }
): { tasks: Task[]; subtaskId?: string } {
  const synced = syncBlockToTask(tasks, link);
  const subtaskId = synced.subtaskId ?? link.subtaskId;
  const doneSynced = syncBlockDoneToSubtask(
    synced.tasks,
    { taskId: link.taskId, subtaskId, name: link.blockName },
    link.done
  );
  return {
    tasks: doneSynced.tasks,
    subtaskId: doneSynced.subtaskId ?? subtaskId,
  };
}

/**
 * Removes subtasks that become orphaned when their owning time blocks are
 * deleted. Only subtaskIds referenced by the deleted blocks are considered;
 * a subtask is removed only when no remaining block still references it, so
 * blocks sharing one subtask (same-name reuse) keep it alive. A task whose
 * subtasks are emptied by this removal is dropped entirely; tasks that were
 * not touched (legacy blocks without subtaskId, pre-existing empty tasks)
 * are never removed.
 */
export function syncBlockDeletionToTasks(
  tasks: Task[],
  remainingBlocks: TimeBlock[],
  deletedBlocks: TimeBlock[]
): Task[] {
  const orphanCandidates = new Set<string>();
  for (const block of deletedBlocks) {
    if (block.subtaskId) orphanCandidates.add(block.subtaskId);
  }
  if (orphanCandidates.size === 0) return tasks;
  const stillReferenced = new Set<string>();
  for (const block of remainingBlocks) {
    if (block.subtaskId) stillReferenced.add(block.subtaskId);
  }

  const toRemove = new Set<string>();
  for (const subtaskId of orphanCandidates) {
    if (!stillReferenced.has(subtaskId)) toRemove.add(subtaskId);
  }
  if (toRemove.size === 0) return tasks;

  let changed = false;
  const nextTasks: Task[] = [];
  for (const task of tasks) {
    const keep = task.subtasks.filter((sub) => !toRemove.has(sub.id));
    if (keep.length === task.subtasks.length) {
      nextTasks.push(task);
      continue;
    }
    changed = true;
    if (keep.length === 0) continue;
    nextTasks.push({ ...task, subtasks: keep });
  }
  return changed ? nextTasks : tasks;
}

/**
 * Mirrors subtask renames from the task modal onto scheduled time blocks,
 * including legacy blocks that only share the old name with the subtask.
 */
export function syncSubtaskRenameToBlocks(
  timeBlocks: TimeBlock[],
  task: Task,
  previousSubtasks: Subtask[]
): TimeBlock[] {
  const nextBySubtaskId = new Map(
    task.subtasks.map((sub) => [sub.id, sub])
  );
  return timeBlocks.map((block) => {
    if (block.subtaskId) {
      const next = nextBySubtaskId.get(block.subtaskId);
      const previous = previousSubtasks.find(
        (sub) => sub.id === block.subtaskId
      );
      if (next && previous && !sameName(previous.name, next.name)) {
        return { ...block, name: next.name };
      }
      return block;
    }

    const changed = previousSubtasks.find((previous) => {
      const next = nextBySubtaskId.get(previous.id);
      if (!next || sameName(previous.name, next.name)) return false;
      return (
        block.taskId === task.id && sameName(block.name, previous.name)
      );
    });
    if (!changed) return block;
    const next = nextBySubtaskId.get(changed.id);
    if (!next) return block;
    return { ...block, name: next.name, subtaskId: next.id };
  });
}
