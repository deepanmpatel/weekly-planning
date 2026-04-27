import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import type { Task } from "../lib/types";
import { TaskCard } from "./TaskCard";

export function SortableTaskCard({
  task,
  onOpen,
}: {
  task: Task;
  onOpen?: (t: Task) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  // While this card is the active drag item, DragOverlay renders the floating
  // preview. We hide the original to avoid a sliding shadow card causing
  // layout jitter or horizontal scroll. Other (non-active) cards still animate
  // out of the way via their own transform.
  const style: React.CSSProperties = isDragging
    ? { opacity: 0, pointerEvents: "none" }
    : { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={clsx(
        "touch-none",
        isDragging ? "cursor-grabbing" : "cursor-grab active:cursor-grabbing"
      )}
    >
      <TaskCard task={task} onOpen={onOpen} />
    </div>
  );
}
