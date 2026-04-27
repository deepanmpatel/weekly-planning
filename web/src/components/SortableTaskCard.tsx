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

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={clsx(
        "touch-none",
        isDragging
          ? "cursor-grabbing opacity-40"
          : "cursor-grab active:cursor-grabbing"
      )}
    >
      <TaskCard task={task} onOpen={onOpen} />
    </div>
  );
}
