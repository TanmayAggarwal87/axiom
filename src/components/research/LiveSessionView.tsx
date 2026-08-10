"use client";

import { useEffect, useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { SessionState } from "@/lib/orchestrator/types";
import type { Task, SessionEvent } from "@/types/shared";
import {
  Search,
  GraduationCap,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Zap,
  FileText,
  FlaskConical,
  ArrowRight,
  CreditCard,
  Plus,
  AlertTriangle,
  Activity,
} from "lucide-react";

// ─── Task Icon & Color Mapping ─────────────────────────────────────────────────

const TASK_META: Record<
  string,
  { icon: React.ElementType; label: string; color: string; bgColor: string }
> = {
  search: {
    icon: Search,
    label: "Web Search",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
  },
  academic: {
    icon: GraduationCap,
    label: "Academic Research",
    color: "text-violet-400",
    bgColor: "bg-violet-500/10",
  },
  safety: {
    icon: ShieldAlert,
    label: "Safety Analysis",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
  },
  factcheck: {
    icon: FlaskConical,
    label: "Fact-Check",
    color: "text-rose-400",
    bgColor: "bg-rose-500/10",
  },
  synthesize: {
    icon: Zap,
    label: "Synthesize",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
  },
  compile: {
    icon: FileText,
    label: "Compile Report",
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
  },
};

const STATUS_CONFIG: Record<
  string,
  { icon: React.ElementType; label: string; color: string; pulse?: boolean }
> = {
  pending: { icon: Clock, label: "Pending", color: "text-muted-foreground" },
  ready: { icon: ArrowRight, label: "Ready", color: "text-blue-400" },
  running: { icon: Loader2, label: "Running", color: "text-amber-400", pulse: true },
  done: { icon: CheckCircle2, label: "Done", color: "text-emerald-400" },
  failed: { icon: XCircle, label: "Failed", color: "text-red-400" },
};

const EVENT_ICON: Record<string, React.ElementType> = {
  task_started: Activity,
  task_completed: CheckCircle2,
  payment_made: CreditCard,
  evidence_added: Search,
  task_spawned: Plus,
  budget_capped: AlertTriangle,
  report_generated: FileText,
};

// ─── Component ─────────────────────────────────────────────────────────────────

interface LiveSessionViewProps {
  sessionId: string;
  onComplete: (state: SessionState) => void;
}

export function LiveSessionView({ sessionId, onComplete }: LiveSessionViewProps) {
  const [state, setState] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let isFetching = false;

    async function poll() {
      if (isFetching || cancelled) return;
      isFetching = true;

      try {
        const res = await fetch(`/api/research/session/${sessionId}`);
        const data = await res.json();
        if (cancelled) return;

        if (data.success && data.state) {
          setState(data.state);

          // Check if all tasks are done or failed (session complete)
          const tasks: Task[] = data.state.tasks || [];
          const allFinished =
            tasks.length > 0 &&
            tasks.every((t: Task) => t.status === "done" || t.status === "failed");

          if (allFinished) {
            onCompleteRef.current(data.state);
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
          }
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      } finally {
        isFetching = false;
      }
    }

    // Initial fetch
    poll();

    // Poll every 2000ms while active
    intervalRef.current = setInterval(poll, 2000);

    return () => {
      cancelled = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sessionId]);

  // Auto-scroll events
  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state?.events.length]);

  if (error) {
    return (
      <Card className="border-red-500/30 bg-red-500/5 p-6 text-center">
        <XCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
        <p className="text-red-300">Failed to load session: {error}</p>
      </Card>
    );
  }

  if (!state) {
    return <LoadingSkeleton />;
  }

  const tasks = state.tasks;
  const events = state.events;
  const completedTasks = tasks.filter((t) => t.status === "done").length;
  const totalTasks = tasks.length;
  const progressPct = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-4 py-1.5 text-xs font-medium text-emerald-400">
          <Activity className="h-3 w-3 animate-pulse" />
          Research Session Active
        </div>
        <h2 className="text-2xl font-bold tracking-tight">
          Agents are working on your query
        </h2>
        <p className="text-muted-foreground text-sm font-mono">{sessionId}</p>
      </div>

      {/* Overall Progress */}
      <Card className="border-border/30 bg-card/50 backdrop-blur-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Overall Progress</span>
          <span className="text-sm text-muted-foreground">
            {completedTasks} / {totalTasks} tasks
          </span>
        </div>
        <Progress value={progressPct} className="h-2" />
        {state.budget && (
          <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
            <span>
              Budget: ${state.budget.spentUsdc.toFixed(4)} / ${state.budget.totalUsdc.toFixed(2)}{" "}
              USDC
            </span>
            <span>
              Fact-check cap: {state.budget.maxFactCheckIterations} iters · Dynamic tasks cap:{" "}
              {state.budget.maxDynamicTasks}
            </span>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Task Pipeline — 3 columns */}
        <div className="lg:col-span-3 space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Zap className="h-3.5 w-3.5" />
            Agent Pipeline
          </h3>
          <div className="space-y-2">
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </div>

        {/* Event Stream — 2 columns */}
        <div className="lg:col-span-2 space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Activity className="h-3.5 w-3.5" />
            Live Events
          </h3>
          <Card className="border-border/30 bg-card/30 backdrop-blur-sm">
            <ScrollArea className="h-[400px] p-3">
              <div className="space-y-2">
                {events.map((event, i) => (
                  <EventItem key={event.id || i} event={event} />
                ))}
                <div ref={eventsEndRef} />
              </div>
            </ScrollArea>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function TaskCard({ task }: { task: Task }) {
  const meta = TASK_META[task.type] || {
    icon: FileText,
    label: task.type,
    color: "text-muted-foreground",
    bgColor: "bg-muted/10",
  };
  const status = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
  const Icon = meta.icon;
  const StatusIcon = status.icon;

  return (
    <Card
      className={`border-border/20 bg-card/30 backdrop-blur-sm p-3 flex items-center gap-3 transition-all duration-300 ${
        task.status === "running" ? "ring-1 ring-amber-500/20 bg-amber-500/5" : ""
      } ${task.status === "done" ? "opacity-80" : ""}`}
    >
      <div className={`rounded-lg p-2 ${meta.bgColor}`}>
        <Icon className={`h-4 w-4 ${meta.color}`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{meta.label}</span>
          {task.createdBy === "factchecker" && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 border-rose-500/30 text-rose-400"
            >
              dynamic
            </Badge>
          )}
        </div>
        {task.input && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{task.input}</p>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <StatusIcon
          className={`h-4 w-4 ${status.color} ${status.pulse ? "animate-spin" : ""}`}
        />
        <span className={`text-xs font-medium ${status.color}`}>{status.label}</span>
      </div>
    </Card>
  );
}

function EventItem({ event }: { event: SessionEvent }) {
  const Icon = EVENT_ICON[event.type] || Activity;
  const time = new Date(event.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const label = event.type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const taskId =
    event.payload &&
    typeof event.payload === "object" &&
    "taskId" in (event.payload as Record<string, unknown>)
      ? String((event.payload as Record<string, unknown>).taskId)
      : null;

  return (
    <div className="flex items-start gap-2 text-xs animate-in fade-in slide-in-from-bottom-1 duration-300">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-foreground/80">{label}</span>
        {taskId && (
          <span className="text-muted-foreground ml-1">
            — {taskId}
          </span>
        )}
      </div>
      <span className="text-muted-foreground/50 shrink-0 font-mono">{time}</span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <div className="text-center space-y-3">
        <Skeleton className="h-6 w-48 mx-auto" />
        <Skeleton className="h-8 w-80 mx-auto" />
      </div>
      <Skeleton className="h-20 w-full" />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
        <div className="lg:col-span-2">
          <Skeleton className="h-[400px] w-full" />
        </div>
      </div>
    </div>
  );
}
