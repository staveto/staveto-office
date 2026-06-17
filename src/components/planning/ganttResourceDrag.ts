import type { DragEvent } from "react";
import type { GanttResourceDragPayload } from "./GanttResourcePanel";

export const GANTT_RESOURCE_MIME = "application/x-gantt-resource";
export const GANTT_BASKET_MIME = "application/x-gantt-resource-basket";

const PLAIN_SINGLE_PREFIX = "staveto-gantt:single:";
const PLAIN_BASKET_PREFIX = "staveto-gantt:basket:";

let dragSessionActive = false;
const dragListeners = new Set<() => void>();

function notifyDragListeners() {
  dragListeners.forEach((listener) => listener());
}

export function subscribeGanttResourceDrag(listener: () => void): () => void {
  dragListeners.add(listener);
  return () => dragListeners.delete(listener);
}

export function isGanttResourceDragSessionActive(): boolean {
  return dragSessionActive;
}

export function beginGanttResourceDrag(): void {
  if (dragSessionActive) return;
  dragSessionActive = true;
  notifyDragListeners();
}

export function endGanttResourceDrag(): void {
  if (!dragSessionActive) return;
  dragSessionActive = false;
  notifyDragListeners();
}

export function basketItemKey(item: GanttResourceDragPayload): string {
  return `${item.kind}:${item.id}`;
}

function dragTypes(e: DragEvent): string[] {
  return Array.from(e.dataTransfer?.types ?? []);
}

export function setResourceDragData(
  e: DragEvent,
  payload: GanttResourceDragPayload
): void {
  const json = JSON.stringify(payload);
  e.dataTransfer.setData(GANTT_RESOURCE_MIME, json);
  e.dataTransfer.setData("text/plain", `${PLAIN_SINGLE_PREFIX}${json}`);
  e.dataTransfer.effectAllowed = "copy";
  beginGanttResourceDrag();
}

export function setBasketDragData(
  e: DragEvent,
  items: GanttResourceDragPayload[]
): void {
  const json = JSON.stringify(items);
  e.dataTransfer.setData(GANTT_BASKET_MIME, json);
  e.dataTransfer.setData("text/plain", `${PLAIN_BASKET_PREFIX}${json}`);
  e.dataTransfer.effectAllowed = "copy";
  beginGanttResourceDrag();
}

export function readDropPayloads(e: DragEvent): GanttResourceDragPayload[] {
  const basketRaw = e.dataTransfer.getData(GANTT_BASKET_MIME);
  if (basketRaw) {
    try {
      const parsed = JSON.parse(basketRaw) as GanttResourceDragPayload[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      /* fall through */
    }
  }

  const singleRaw = e.dataTransfer.getData(GANTT_RESOURCE_MIME);
  if (singleRaw) {
    try {
      return [JSON.parse(singleRaw) as GanttResourceDragPayload];
    } catch {
      /* fall through */
    }
  }

  const plain = e.dataTransfer.getData("text/plain");
  if (plain.startsWith(PLAIN_BASKET_PREFIX)) {
    try {
      const parsed = JSON.parse(
        plain.slice(PLAIN_BASKET_PREFIX.length)
      ) as GanttResourceDragPayload[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      /* fall through */
    }
  }
  if (plain.startsWith(PLAIN_SINGLE_PREFIX)) {
    try {
      return [JSON.parse(plain.slice(PLAIN_SINGLE_PREFIX.length)) as GanttResourceDragPayload];
    } catch {
      /* fall through */
    }
  }

  return [];
}

export function isResourceDrag(e: DragEvent): boolean {
  if (dragSessionActive) return true;
  const types = dragTypes(e);
  return (
    types.includes(GANTT_RESOURCE_MIME) ||
    types.includes(GANTT_BASKET_MIME) ||
    types.some((type) => type === "text/plain")
  );
}

export function handleResourceDragEnd(): void {
  endGanttResourceDrag();
}
