interface TaskTimerProps {
  activeTaskId: string | null;
  activeTaskTitle: string;
  elapsed: number; // ms
  onStop: () => void;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export default function TaskTimer({
  activeTaskId,
  activeTaskTitle,
  elapsed,
  onStop,
}: TaskTimerProps) {
  if (!activeTaskId) return null;

  return (
    <div className="task-timer-display">
      <span className="task-timer-task-name">{activeTaskTitle}</span>
      <span className="task-timer-elapsed">{formatElapsed(elapsed)}</span>
      <button
        className="task-timer-stop-btn"
        onClick={onStop}
        title="Stop timer"
      >
        ■
      </button>
    </div>
  );
}
