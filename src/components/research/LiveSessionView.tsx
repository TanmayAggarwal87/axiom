"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Layers,
} from "lucide-react";

// ─── Task Icon & Meta Mapping ──────────────────────────────────────────────────

const TASK_META: Record<
  string,
  { icon: React.ElementType; label: string; color: string; bgColor: string }
> = {
  search: {
    icon: Search,
    label: "Web Search Agent",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
  },
  academic: {
    icon: GraduationCap,
    label: "Academic Research Agent",
    color: "text-violet-400",
    bgColor: "bg-violet-500/10",
  },
  safety: {
    icon: ShieldAlert,
    label: "Safety & Risk Agent",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
  },
  factcheck: {
    icon: FlaskConical,
    label: "Fact-Checking Agent",
    color: "text-rose-400",
    bgColor: "bg-rose-500/10",
  },
  synthesize: {
    icon: Zap,
    label: "Synthesis Reducer",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
  },
  compile: {
    icon: FileText,
    label: "PDF Generator",
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
  },
};

const STATUS_CONFIG: Record<
  string,
  { icon: React.ElementType; label: string; color: string; pulse?: boolean }
> = {
  pending: { icon: Clock, label: "Waiting", color: "text-muted-foreground" },
  ready: { icon: ArrowRight, label: "Ready", color: "text-blue-400" },
  running: { icon: Loader2, label: "Working...", color: "text-amber-400", pulse: true },
  done: { icon: CheckCircle2, label: "Completed", color: "text-emerald-400" },
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

interface LiveSessionViewProps {
  sessionId: string;
  onComplete: (state: SessionState) => void;
}

export function LiveSessionView({ sessionId, onComplete }: LiveSessionViewProps) {
  const [state, setState] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isFetchingRef = useRef(false);
  const isFinishedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notFoundCountRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const fetchState = useCallback(async () => {
    if (!sessionId || isFetchingRef.current || isFinishedRef.current) return;
    isFetchingRef.current = true;

    try {
      const res = await fetch(`/api/research/session/${sessionId}`);

      if (res.status === 404) {
        notFoundCountRef.current++;
        return;
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 403) {
          setError(errorData.error || "Forbidden: You do not have permission to view this session.");
          isFinishedRef.current = true;
        }
        return;
      }

      notFoundCountRef.current = 0;
      const data = await res.json();

      if (data.success && data.state) {
        setState(data.state);

        const tasks: Task[] = data.state.tasks || [];
        const allFinished =
          tasks.length > 0 &&
          tasks.every((t: Task) => t.status === "done" || t.status === "failed");

        if (allFinished) {
          isFinishedRef.current = true;
          onCompleteRef.current(data.state);
        }
      }
    } catch (err: any) {
      console.warn("[LiveSessionView] Network fetch warning (will retry):", err.message);
    } finally {
      isFetchingRef.current = false;
    }
  }, [sessionId]);

  // 1. Single in-flight request polling (guarantees NO Network tab pending queueing)
  useEffect(() => {
    let isActive = true;
    isFinishedRef.current = false;

    const runPollLoop = async () => {
      if (!isActive || isFinishedRef.current) return;
      await fetchState();
      if (isActive && !isFinishedRef.current) {
        timerRef.current = setTimeout(runPollLoop, 3000);
      }
    };

    runPollLoop();

    return () => {
      isActive = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [fetchState]);

  // 2. Supabase Realtime Subscription on 'events' table for zero-latency updates
  useEffect(() => {
    if (!sessionId) return;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes("your-supabase")) {
      return;
    }

    try {
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const channel = supabase
        .channel(`session-events-${sessionId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "events",
            filter: `session_id=eq.${sessionId}`,
          },
          () => {
            fetchState();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } catch (err) {
      console.warn("[Realtime] Failed to subscribe to session events:", err);
    }
  }, [sessionId, fetchState]);

  // Auto-scroll event stream
  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state?.events.length]);

  if (error) {
    return (
      <Card className="border-red-500/30 bg-red-500/5 p-6 text-center max-w-xl mx-auto">
        <XCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
        <p className="text-red-300 font-medium">Failed to load session</p>
        <p className="text-xs text-muted-foreground mt-1">{error}</p>
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
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 px-2 sm:px-4">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-4 py-1.5 text-xs font-medium text-emerald-400 backdrop-blur-sm">
          <Activity className="h-3 w-3 animate-pulse text-emerald-400" />
          Realtime Research Pipeline Active
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-transparent">
          Autonomous Agents in Motion
        </h2>
        <p className="text-xs text-muted-foreground font-mono break-all max-w-md mx-auto">
          Session: {sessionId}
        </p>
      </div>

      {/* Realtime Pipeline Stepper Flow */}
      <Card className="border-border/30 bg-card/60 backdrop-blur-md p-4 sm:p-5 shadow-lg">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
          <Layers className="h-4 w-4 text-emerald-400" />
          Pipeline Execution Overview
        </h3>
        <PipelineStepper tasks={tasks} />
      </Card>

      {/* Overall Progress Card */}
      <Card className="border-border/30 bg-card/50 backdrop-blur-sm p-4">
        <div className="flex items-center justify-between mb-2 text-sm">
          <span className="font-medium text-foreground">Overall Progress</span>
          <span className="font-mono text-emerald-400 font-semibold">
            {progressPct}% ({completedTasks}/{totalTasks} tasks)
          </span>
        </div>
        <Progress value={progressPct} className="h-2 bg-muted/30" />
        {state.budget && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-3 text-xs text-muted-foreground gap-1">
            <span className="font-mono">
              Spent: ${state.budget.spentUsdc.toFixed(4)} / ${state.budget.totalUsdc.toFixed(2)} USDC
            </span>
            <span>
              Fact-Check Caps: max {state.budget.maxFactCheckIterations} iterations · max {state.budget.maxDynamicTasks} dynamic tasks
            </span>
          </div>
        )}
      </Card>

      {/* Pipeline & Events Split */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Agent Cards (3 cols) */}
        <div className="lg:col-span-3 space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-amber-400" />
            Agent Task Stream
          </h3>
          <div className="space-y-2.5">
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </div>

        {/* Live Events Stream (2 cols) */}
        <div className="lg:col-span-2 space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-emerald-400" />
            Live Event Stream
          </h3>
          <Card className="border-border/30 bg-card/30 backdrop-blur-sm">
            <ScrollArea className="h-[420px] p-3">
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

// ─── Pipeline Stepper Visualizer ───────────────────────────────────────────────

function PipelineStepper({ tasks }: { tasks: Task[] }) {
  const steps = [
    { type: "search", label: "Search Agent" },
    { type: "academic", label: "Academic Agent" },
    { type: "safety", label: "Safety Agent" },
    { type: "factcheck", label: "Fact Checker" },
    { type: "synthesize", label: "Synthesis Reducer" },
    { type: "compile", label: "PDF Generator" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      {steps.map((step, idx) => {
        const matchedTasks = tasks.filter((t) => t.type === step.type);
        let status: "pending" | "running" | "done" | "failed" = "pending";

        if (matchedTasks.some((t) => t.status === "failed")) {
          status = "failed";
        } else if (matchedTasks.some((t) => t.status === "running")) {
          status = "running";
        } else if (matchedTasks.length > 0 && matchedTasks.every((t) => t.status === "done")) {
          status = "done";
        }

        return (
          <div
            key={idx}
            className={`rounded-lg border p-2 text-center transition-all duration-300 ${
              status === "done"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : status === "running"
                ? "border-amber-500/40 bg-amber-500/10 text-amber-300 animate-pulse shadow-sm shadow-amber-500/20"
                : status === "failed"
                ? "border-red-500/30 bg-red-500/10 text-red-300"
                : "border-border/20 bg-muted/10 text-muted-foreground"
            }`}
          >
            <div className="flex items-center justify-center gap-1 mb-1">
              {status === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
              {status === "running" && <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />}
              {status === "failed" && <XCircle className="h-3.5 w-3.5 text-red-400" />}
              {status === "pending" && <Clock className="h-3.5 w-3.5 text-muted-foreground/60" />}
            </div>
            <p className="text-[11px] font-medium truncate">{step.label}</p>
            <p className="text-[9px] uppercase tracking-wider mt-0.5 opacity-80">
              {status === "running" ? "Working..." : status}
            </p>
          </div>
        );
      })}
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
      className={`border-border/20 bg-card/40 backdrop-blur-sm p-3 flex flex-row items-start sm:items-center gap-3 transition-all duration-300 ${
        task.status === "running"
          ? "ring-1 ring-amber-500/30 bg-amber-500/5 shadow-md shadow-amber-500/5"
          : task.status === "done"
          ? "border-emerald-500/20 bg-emerald-500/[0.02]"
          : task.status === "failed"
          ? "border-red-500/20 bg-red-500/5"
          : ""
      }`}
    >
      <div className={`rounded-lg p-2 shrink-0 ${meta.bgColor}`}>
        <Icon className={`h-4 w-4 ${meta.color}`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs sm:text-sm font-semibold truncate">{meta.label}</span>
          {task.createdBy === "factchecker" && (
            <Badge
              variant="outline"
              className="text-[9px] px-1.5 py-0 border-rose-500/30 text-rose-400 bg-rose-500/5"
            >
              dynamic
            </Badge>
          )}
        </div>
        {task.input && (
          <p className="text-xs text-muted-foreground/80 truncate mt-0.5 max-w-full">
            {task.input}
          </p>
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
    <div className="flex items-start gap-2 text-xs transition-all duration-300">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-foreground/90 font-medium">{label}</span>
        {taskId && <span className="text-muted-foreground ml-1.5 font-mono text-[10px]">({taskId})</span>}
      </div>
      <span className="text-muted-foreground/50 shrink-0 font-mono text-[10px]">{time}</span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-4 py-1.5 text-xs font-medium text-emerald-400 backdrop-blur-sm">
          <Loader2 className="h-3 w-3 animate-spin text-emerald-400" />
          Initializing Autonomous Research Agents...
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground/80">
          Preparing Research Plan & Pipeline
        </h2>
      </div>
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-20 w-full rounded-xl" />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
        <div className="lg:col-span-2">
          <Skeleton className="h-[420px] w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
