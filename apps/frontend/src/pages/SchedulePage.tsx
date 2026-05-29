import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import type {
  CreateEventInput,
  CreateTaskInput,
  Event as EventDto,
  Task,
  TaskPriority,
  TaskStatus,
} from "@assistant/shared";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useConfirm } from "../components/ui/confirm-dialog";
import { api, ApiError } from "../lib/api";
import { cn } from "../lib/cn";

type View = "calendar" | "kanban";

const TASK_STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "Cần làm" },
  { value: "doing", label: "Đang làm" },
  { value: "done", label: "Đã xong" },
];

const TASK_PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: "urgent", label: "Khẩn" },
  { value: "high", label: "Cao" },
  { value: "medium", label: "Vừa" },
  { value: "low", label: "Thấp" },
];

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  urgent: "Khẩn",
  high: "Cao",
  medium: "Vừa",
  low: "Thấp",
};

const PRIORITY_TONE: Record<TaskPriority, string> = {
  urgent: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  low: "bg-slate-100 text-slate-700 border-slate-200",
};

const DAY_MS = 86_400_000;

const VN_DATE = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const VN_TIME = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfCalendar(d: Date): Date {
  const first = startOfMonth(d);
  const dow = (first.getDay() + 6) % 7;
  return new Date(first.getFullYear(), first.getMonth(), 1 - dow);
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInputValue(value: string): string {
  return new Date(value).toISOString();
}

export function SchedulePage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [view, setView] = useState<View>("calendar");
  const [monthCursor, setMonthCursor] = useState<Date>(() => new Date());
  const [eventModal, setEventModal] = useState<EventDto | "new" | null>(null);
  const [taskModal, setTaskModal] = useState<Task | "new" | null>(null);
  const [telegramMessage, setTelegramMessage] = useState<string | null>(null);

  const rangeFrom = useMemo(
    () => startOfCalendar(monthCursor).toISOString(),
    [monthCursor],
  );
  const rangeTo = useMemo(() => {
    const cal = startOfCalendar(monthCursor);
    return new Date(cal.getTime() + 42 * DAY_MS - 1).toISOString();
  }, [monthCursor]);

  const eventsQuery = useQuery({
    queryKey: ["events", { from: rangeFrom, to: rangeTo }],
    queryFn: () => api.listEvents({ from: rangeFrom, to: rangeTo }),
  });
  const tasksQuery = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api.listTasks(),
  });
  const remindersQuery = useQuery({
    queryKey: ["reminders"],
    queryFn: () => api.listReminders(),
  });

  const invalidateAll = (): void => {
    void qc.invalidateQueries({ queryKey: ["events"] });
    void qc.invalidateQueries({ queryKey: ["tasks"] });
    void qc.invalidateQueries({ queryKey: ["reminders"] });
  };

  const createEvent = useMutation({
    mutationFn: api.createEvent,
    onSuccess: () => invalidateAll(),
  });
  const updateEvent = useMutation({
    mutationFn: (args: {
      id: string;
      input: Parameters<typeof api.updateEvent>[1];
    }) => api.updateEvent(args.id, args.input),
    onSuccess: () => invalidateAll(),
  });
  const deleteEvent = useMutation({
    mutationFn: api.deleteEvent,
    onSuccess: () => invalidateAll(),
  });

  const createTask = useMutation({
    mutationFn: api.createTask,
    onSuccess: () => invalidateAll(),
  });
  const updateTask = useMutation({
    mutationFn: (args: {
      id: string;
      input: Parameters<typeof api.updateTask>[1];
    }) => api.updateTask(args.id, args.input),
    onSuccess: () => invalidateAll(),
  });
  const deleteTask = useMutation({
    mutationFn: api.deleteTask,
    onSuccess: () => invalidateAll(),
  });

  const testTelegram = useMutation({
    mutationFn: api.testTelegram,
    onSuccess: (data) => setTelegramMessage(data.message),
    onError: (err: unknown) => {
      const message =
        err instanceof ApiError ? err.message : "Không gửi được Telegram";
      setTelegramMessage(message);
    },
  });

  const events = eventsQuery.data ?? [];
  const tasks = tasksQuery.data ?? [];

  return (
    <section className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">Lịch & Công việc</h1>
          <span className="text-sm text-muted-foreground">
            {eventsQuery.isLoading
              ? "đang tải…"
              : `${events.length} sự kiện · ${tasks.length} task`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border bg-background p-0.5 text-sm">
            <button
              type="button"
              onClick={() => setView("calendar")}
              className={cn(
                "rounded px-3 py-1.5",
                view === "calendar"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent",
              )}
            >
              Lịch
            </button>
            <button
              type="button"
              onClick={() => setView("kanban")}
              className={cn(
                "rounded px-3 py-1.5",
                view === "kanban"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent",
              )}
            >
              Kanban
            </button>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => testTelegram.mutate()}
            disabled={testTelegram.isPending}
            title="Gửi tin nhắn thử tới Telegram"
          >
            Telegram test
          </Button>
          <Button size="sm" onClick={() => setEventModal("new")}>
            + Sự kiện
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setTaskModal("new")}
          >
            + Task
          </Button>
        </div>
      </header>

      {telegramMessage && (
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span>{telegramMessage}</span>
          <button
            type="button"
            className="ml-3 text-xs underline"
            onClick={() => setTelegramMessage(null)}
          >
            đóng
          </button>
        </div>
      )}

      {view === "calendar" ? (
        <CalendarView
          monthCursor={monthCursor}
          onMonth={setMonthCursor}
          events={events}
          tasks={tasks}
          onEventClick={(e) => setEventModal(e)}
          onTaskClick={(t) => setTaskModal(t)}
        />
      ) : (
        <KanbanView
          tasks={tasks}
          onMove={(task, status) =>
            updateTask.mutate({ id: task.id, input: { status } })
          }
          onClick={(t) => setTaskModal(t)}
          onDelete={async (t) => {
            const ok = await confirm({
              title: `Xoá task "${t.title}"?`,
              description: "Hành động này không thể hoàn tác.",
              confirmText: "Xoá",
              variant: "destructive",
            });
            if (ok) deleteTask.mutate(t.id);
          }}
        />
      )}

      {eventModal && (
        <EventModal
          initial={eventModal === "new" ? null : eventModal}
          isPending={createEvent.isPending || updateEvent.isPending}
          onClose={() => setEventModal(null)}
          onSubmit={async (input, id) => {
            if (id) {
              await updateEvent.mutateAsync({ id, input });
            } else {
              await createEvent.mutateAsync(input);
            }
            setEventModal(null);
          }}
          onDelete={async (id) => {
            const ok = await confirm({
              title: "Xoá sự kiện này?",
              description: "Sự kiện sẽ bị xoá vĩnh viễn.",
              confirmText: "Xoá",
              variant: "destructive",
            });
            if (ok) {
              await deleteEvent.mutateAsync(id);
              setEventModal(null);
            }
          }}
        />
      )}

      {taskModal && (
        <TaskModal
          initial={taskModal === "new" ? null : taskModal}
          isPending={createTask.isPending || updateTask.isPending}
          onClose={() => setTaskModal(null)}
          onSubmit={async (input, id) => {
            if (id) {
              await updateTask.mutateAsync({ id, input });
            } else {
              await createTask.mutateAsync(input);
            }
            setTaskModal(null);
          }}
          onDelete={async (id) => {
            const ok = await confirm({
              title: "Xoá task này?",
              description: "Task sẽ bị xoá vĩnh viễn.",
              confirmText: "Xoá",
              variant: "destructive",
            });
            if (ok) {
              await deleteTask.mutateAsync(id);
              setTaskModal(null);
            }
          }}
        />
      )}

      <RemindersFootnote remindersCount={remindersQuery.data?.length ?? 0} />
    </section>
  );
}

interface CalendarViewProps {
  monthCursor: Date;
  onMonth: (next: Date) => void;
  events: EventDto[];
  tasks: Task[];
  onEventClick: (event: EventDto) => void;
  onTaskClick: (task: Task) => void;
}

function CalendarView({
  monthCursor,
  onMonth,
  events,
  tasks,
  onEventClick,
  onTaskClick,
}: CalendarViewProps) {
  const cells = useMemo(() => {
    const start = startOfCalendar(monthCursor);
    return Array.from({ length: 42 }, (_, i) => new Date(start.getTime() + i * DAY_MS));
  }, [monthCursor]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, EventDto[]>();
    for (const e of events) {
      const start = new Date(e.startAt);
      const end = new Date(e.endAt);
      let cursor = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate(),
      );
      const endKey = dayKey(end);
      let guard = 0;
      while (dayKey(cursor) <= endKey && guard < 90) {
        const k = dayKey(cursor);
        const list = map.get(k) ?? [];
        list.push(e);
        map.set(k, list);
        cursor = new Date(cursor.getTime() + DAY_MS);
        guard += 1;
      }
    }
    return map;
  }, [events]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.deadline) continue;
      const k = dayKey(new Date(t.deadline));
      const list = map.get(k) ?? [];
      list.push(t);
      map.set(k, list);
    }
    return map;
  }, [tasks]);

  const monthLabel = new Intl.DateTimeFormat("vi-VN", {
    month: "long",
    year: "numeric",
  }).format(monthCursor);

  const goPrev = (): void =>
    onMonth(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1));
  const goNext = (): void =>
    onMonth(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1));
  const goToday = (): void => onMonth(new Date());

  const today = new Date();
  const monthIndex = monthCursor.getMonth();

  return (
    <div className="rounded-md border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={goPrev}>
            ←
          </Button>
          <Button size="sm" variant="ghost" onClick={goToday}>
            Hôm nay
          </Button>
          <Button size="sm" variant="ghost" onClick={goNext}>
            →
          </Button>
        </div>
        <div className="font-medium capitalize">{monthLabel}</div>
        <div className="w-[120px]" />
      </div>
      <div className="grid grid-cols-7 border-b text-xs font-medium uppercase text-muted-foreground">
        {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d) => (
          <div key={d} className="border-r px-2 py-1 last:border-r-0">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === monthIndex;
          const k = dayKey(d);
          const dayEvents = eventsByDay.get(k) ?? [];
          const dayTasks = tasksByDay.get(k) ?? [];
          const eventsToShow = dayEvents.slice(0, 3);
          const tasksRoom = Math.max(0, 3 - eventsToShow.length);
          const tasksToShow = dayTasks.slice(0, tasksRoom);
          const hiddenCount =
            dayEvents.length + dayTasks.length - eventsToShow.length - tasksToShow.length;
          return (
            <div
              key={i}
              className={cn(
                "min-h-[112px] border-b border-r p-1.5 text-xs last:border-r-0",
                !inMonth && "bg-muted/30 text-muted-foreground",
                sameDay(d, today) && "bg-primary/5",
              )}
            >
              <div
                className={cn(
                  "mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full",
                  sameDay(d, today) &&
                    "bg-primary text-primary-foreground font-semibold",
                )}
              >
                {d.getDate()}
              </div>
              <div className="flex flex-col gap-1">
                {eventsToShow.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onEventClick(e)}
                    className="truncate rounded bg-blue-100 px-1.5 py-0.5 text-left text-blue-900 hover:bg-blue-200"
                    title={`${e.title} — ${VN_TIME.format(new Date(e.startAt))}`}
                  >
                    {e.allDay ? "·" : VN_TIME.format(new Date(e.startAt))}{" "}
                    {e.title}
                  </button>
                ))}
                {tasksToShow.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onTaskClick(t)}
                    className={cn(
                      "truncate rounded border px-1.5 py-0.5 text-left",
                      PRIORITY_TONE[t.priority],
                      t.status === "done" && "line-through opacity-70",
                    )}
                    title={`${t.title} (${PRIORITY_LABEL[t.priority]})`}
                  >
                    ✓ {t.title}
                  </button>
                ))}
                {hiddenCount > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{hiddenCount} mục khác
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface KanbanViewProps {
  tasks: Task[];
  onMove: (task: Task, status: TaskStatus) => void;
  onClick: (task: Task) => void;
  onDelete: (task: Task) => void;
}

function KanbanView({ tasks, onMove, onClick, onDelete }: KanbanViewProps) {
  const groups = useMemo(() => {
    const g: Record<TaskStatus, Task[]> = { todo: [], doing: [], done: [] };
    for (const t of tasks) g[t.status].push(t);
    return g;
  }, [tasks]);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {TASK_STATUSES.map((col) => (
        <div key={col.value} className="flex flex-col rounded-md border bg-card">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="font-medium">{col.label}</span>
            <span className="text-xs text-muted-foreground">
              {groups[col.value].length}
            </span>
          </div>
          <div className="flex flex-col gap-2 p-2">
            {groups[col.value].length === 0 && (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                Trống
              </p>
            )}
            {groups[col.value].map((t) => (
              <article
                key={t.id}
                className="rounded-md border bg-background p-2 text-sm shadow-sm"
              >
                <button
                  type="button"
                  className="block w-full text-left"
                  onClick={() => onClick(t)}
                >
                  <div className="font-medium">{t.title}</div>
                  {t.deadline && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Hạn: {VN_DATE.format(new Date(t.deadline))}{" "}
                      {VN_TIME.format(new Date(t.deadline))}
                    </div>
                  )}
                  <div className="mt-1 inline-block">
                    <span
                      className={cn(
                        "rounded border px-1.5 py-0.5 text-[10px]",
                        PRIORITY_TONE[t.priority],
                      )}
                    >
                      {PRIORITY_LABEL[t.priority]}
                    </span>
                  </div>
                </button>
                <div className="mt-2 flex flex-wrap gap-1">
                  {TASK_STATUSES.filter((s) => s.value !== t.status).map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => onMove(t, s.value)}
                      className="rounded border px-1.5 py-0.5 text-[10px] hover:bg-accent"
                    >
                      → {s.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => onDelete(t)}
                    className="rounded border px-1.5 py-0.5 text-[10px] text-destructive hover:bg-destructive/10"
                  >
                    Xoá
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface EventModalProps {
  initial: EventDto | null;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (input: CreateEventInput, id?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function EventModal({
  initial,
  isPending,
  onClose,
  onSubmit,
  onDelete,
}: EventModalProps) {
  const now = new Date();
  const defaultStart = initial
    ? new Date(initial.startAt)
    : new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours() + 1,
        0,
      );
  const defaultEnd = initial
    ? new Date(initial.endAt)
    : new Date(defaultStart.getTime() + 60 * 60_000);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [startAt, setStartAt] = useState(toLocalInputValue(defaultStart));
  const [endAt, setEndAt] = useState(toLocalInputValue(defaultEnd));
  const [allDay, setAllDay] = useState(initial?.allDay ?? false);
  const [location, setLocation] = useState(initial?.location ?? "");
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderOffset, setReminderOffset] = useState<number>(15);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    try {
      const startIso = fromLocalInputValue(startAt);
      const endIso = fromLocalInputValue(endAt);
      if (new Date(endIso).getTime() < new Date(startIso).getTime()) {
        setError("Kết thúc phải sau hoặc bằng bắt đầu");
        return;
      }
      const remindAt =
        !initial && reminderEnabled
          ? new Date(
              new Date(startIso).getTime() - reminderOffset * 60_000,
            ).toISOString()
          : null;
      await onSubmit(
        {
          title: title.trim(),
          description: description.trim() ? description : null,
          startAt: startIso,
          endAt: endIso,
          allDay,
          location: location.trim() ? location : null,
          remindAt,
        },
        initial?.id,
      );
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError ? err.message : "Không lưu được sự kiện";
      setError(msg);
    }
  };

  return (
    <Modal title={initial ? "Sửa sự kiện" : "Sự kiện mới"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <Label htmlFor="ev-title">Tiêu đề</Label>
          <Input
            id="ev-title"
            required
            maxLength={255}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="ev-start">Bắt đầu</Label>
            <Input
              id="ev-start"
              type="datetime-local"
              required
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ev-end">Kết thúc</Label>
            <Input
              id="ev-end"
              type="datetime-local"
              required
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
            />
          </div>
        </div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
          />
          Cả ngày
        </label>
        <div>
          <Label htmlFor="ev-location">Địa điểm</Label>
          <Input
            id="ev-location"
            maxLength={255}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="ev-desc">Mô tả</Label>
          <textarea
            id="ev-desc"
            rows={3}
            maxLength={5000}
            value={description ?? ""}
            onChange={(e) => setDescription(e.target.value)}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none"
          />
        </div>
        {!initial && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={reminderEnabled}
                onChange={(e) => setReminderEnabled(e.target.checked)}
              />
              Nhắc qua Telegram trước
            </label>
            {reminderEnabled && (
              <div className="mt-2 flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={reminderOffset}
                  onChange={(e) =>
                    setReminderOffset(Number(e.target.value) || 15)
                  }
                  className="w-24"
                />
                <span>phút trước khi bắt đầu</span>
              </div>
            )}
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center justify-between pt-2">
          {initial ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => void onDelete(initial.id)}
            >
              Xoá
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Huỷ
            </Button>
            <Button type="submit" disabled={isPending || !title.trim()}>
              {initial ? "Lưu" : "Tạo"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

interface TaskModalProps {
  initial: Task | null;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (input: CreateTaskInput, id?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function TaskModal({
  initial,
  isPending,
  onClose,
  onSubmit,
  onDelete,
}: TaskModalProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [priority, setPriority] = useState<TaskPriority>(
    initial?.priority ?? "medium",
  );
  const [status, setStatus] = useState<TaskStatus>(initial?.status ?? "todo");
  const [deadline, setDeadline] = useState(
    initial?.deadline ? toLocalInputValue(new Date(initial.deadline)) : "",
  );
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderOffset, setReminderOffset] = useState(60);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    try {
      const deadlineIso = deadline ? fromLocalInputValue(deadline) : null;
      const remindAt =
        !initial && reminderEnabled && deadlineIso
          ? new Date(
              new Date(deadlineIso).getTime() - reminderOffset * 60_000,
            ).toISOString()
          : null;
      await onSubmit(
        {
          title: title.trim(),
          description: description?.trim() ? description : null,
          priority,
          status,
          deadline: deadlineIso,
          remindAt,
        },
        initial?.id,
      );
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : "Không lưu được task";
      setError(msg);
    }
  };

  return (
    <Modal title={initial ? "Sửa task" : "Task mới"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <Label htmlFor="task-title">Tiêu đề</Label>
          <Input
            id="task-title"
            required
            maxLength={255}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="task-priority">Mức ưu tiên</Label>
            <select
              id="task-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="task-status">Trạng thái</Label>
            <select
              id="task-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {TASK_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <Label htmlFor="task-deadline">Hạn (không bắt buộc)</Label>
          <Input
            id="task-deadline"
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="task-desc">Mô tả</Label>
          <textarea
            id="task-desc"
            rows={3}
            maxLength={5000}
            value={description ?? ""}
            onChange={(e) => setDescription(e.target.value)}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none"
          />
        </div>
        {!initial && deadline && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={reminderEnabled}
                onChange={(e) => setReminderEnabled(e.target.checked)}
              />
              Nhắc Telegram trước hạn
            </label>
            {reminderEnabled && (
              <div className="mt-2 flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={10080}
                  value={reminderOffset}
                  onChange={(e) =>
                    setReminderOffset(Number(e.target.value) || 60)
                  }
                  className="w-24"
                />
                <span>phút trước deadline</span>
              </div>
            )}
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center justify-between pt-2">
          {initial ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => void onDelete(initial.id)}
            >
              Xoá
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Huỷ
            </Button>
            <Button type="submit" disabled={isPending || !title.trim()}>
              {initial ? "Lưu" : "Tạo"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

function Modal({ title, onClose, children }: ModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-lg bg-background shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-medium">{title}</h2>
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:bg-accent"
            onClick={onClose}
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function RemindersFootnote({
  remindersCount,
}: {
  remindersCount: number;
}) {
  if (remindersCount === 0) return null;
  return (
    <p className="text-xs text-muted-foreground">
      Đang theo dõi {remindersCount} reminder · cần cấu hình Telegram bot token
      + chat_id trong Cài đặt để nhận thông báo.
    </p>
  );
}
