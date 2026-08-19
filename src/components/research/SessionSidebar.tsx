"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Clock,
  Loader2,
  AlertCircle,
  Play,
  CheckCircle2,
  XCircle,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface SessionMeta {
  id: string;
  query: string;
  status: "in_progress" | "completed" | "failed";
  created_at: string;
}

export function SessionSidebar() {
  const router = useRouter();
  const params = useParams();
  const { isLoaded, isSignedIn } = useAuth();

  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const activeSessionId = params?.sessionId as string | undefined;

  async function fetchSessions() {
    if (!isSignedIn) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/research/sessions");
      const data = await res.json();
      if (data.success && Array.isArray(data.sessions)) {
        setSessions(data.sessions);
      } else {
        setError(data.error || "Failed to fetch history");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load history");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      fetchSessions();
    }
  }, [isLoaded, isSignedIn, activeSessionId]);

  function handleNewResearch() {
    router.push("/");
  }

  function handleSelectSession(id: string) {
    router.push(`/research/${id}`);
  }

  async function handleDeleteSession(id: string) {
    if (!confirm("Are you sure you want to delete this research session from your history?")) {
      return;
    }

    try {
      const res = await fetch(`/api/research/session/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (data.success) {
        toast.success("Research session deleted");
        setSessions((prev) => prev.filter((s) => s.id !== id));
        if (activeSessionId === id) {
          router.push("/");
        }
      } else {
        toast.error(data.error || "Failed to delete session");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to delete session");
    }
  }

  async function handleClearHistory() {
    if (!confirm("Are you sure you want to clear your entire research history? This cannot be undone.")) {
      return;
    }

    try {
      const res = await fetch("/api/research/sessions", {
        method: "DELETE",
      });
      const data = await res.json();

      if (data.success) {
        toast.success("Research history cleared");
        setSessions([]);
        router.push("/");
      } else {
        toast.error(data.error || "Failed to clear history");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to clear history");
    }
  }

  function getRelativeTime(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      if (diffMs < 0) return "Just now";

      const diffSecs = Math.floor(diffMs / 1000);
      if (diffSecs < 60) return "Just now";

      const diffMins = Math.floor(diffSecs / 60);
      if (diffMins < 60) return `${diffMins}m ago`;

      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;

      const diffDays = Math.floor(diffHours / 24);
      if (diffDays === 1) return "Yesterday";
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch {
      return "Some time ago";
    }
  }

  if (!isSignedIn) return null;

  return (
    <div
      className={cn(
        "relative flex flex-col border-r border-border/20 bg-card/45 backdrop-blur-md transition-all duration-300 ease-in-out shrink-0 h-[calc(100vh-3.5rem)] sticky top-14 z-40",
        collapsed ? "w-14" : "w-64 sm:w-72"
      )}
    >
      {/* Toggle button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-4 flex h-6 w-6 items-center justify-center rounded-full border border-border/30 bg-background text-muted-foreground hover:text-foreground shadow-md hover:scale-105 transition-all cursor-pointer z-50"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3" />
        ) : (
          <ChevronLeft className="h-3 w-3" />
        )}
      </button>

      {/* Top action */}
      <div className={cn("p-3 border-b border-border/10", collapsed ? "flex justify-center" : "")}>
        {collapsed ? (
          <Button
            size="icon"
            onClick={handleNewResearch}
            className="h-9 w-9 rounded-lg bg-foreground text-background hover:bg-foreground/90 cursor-pointer"
            title="New Research"
          >
            <Plus className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleNewResearch}
            className="w-full gap-2 bg-foreground text-background hover:bg-foreground/90 justify-start px-3 py-2 cursor-pointer font-medium text-sm transition-all"
          >
            <Plus className="h-4 w-4 shrink-0" />
            New Research
          </Button>
        )}
      </div>

      {/* History content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {!collapsed && (
          <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 flex items-center gap-1.5 shrink-0">
            <Clock className="h-3 w-3" />
            Recent Research
          </div>
        )}

        <ScrollArea className="flex-1 px-2 pb-4">
          <div className="space-y-1 mt-1">
            {loading && sessions.length === 0 && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" />
              </div>
            )}

            {error && !collapsed && (
              <div className="px-3 py-4 text-center text-xs text-red-400 bg-red-500/5 rounded-lg border border-red-500/10 mx-2">
                <AlertCircle className="h-4 w-4 mx-auto mb-1 text-red-400" />
                <p>{error}</p>
              </div>
            )}

            {!loading && sessions.length === 0 && !error && !collapsed && (
              <p className="text-center text-xs text-muted-foreground/40 py-8 px-2 font-mono">
                No past sessions found.
              </p>
            )}

            {sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              const statusConfig =
                session.status === "in_progress"
                  ? { icon: Play, color: "text-amber-400", bg: "bg-amber-400/5" }
                  : session.status === "failed"
                    ? { icon: XCircle, color: "text-red-400", bg: "bg-red-400/5" }
                    : { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-400/5" };

              const StatusIcon = statusConfig.icon;

              if (collapsed) {
                return (
                  <button
                    key={session.id}
                    onClick={() => handleSelectSession(session.id)}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg mx-auto transition-all cursor-pointer",
                      isActive
                        ? "bg-accent/80 text-foreground ring-1 ring-border/20"
                        : "hover:bg-accent/30 text-muted-foreground hover:text-foreground"
                    )}
                    title={session.query}
                  >
                    <StatusIcon className={cn("h-4 w-4 shrink-0", statusConfig.color)} />
                  </button>
                );
              }

              return (
                <div
                  key={session.id}
                  className={cn(
                    "w-full flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs transition-all hover:bg-accent/40 group relative overflow-hidden",
                    isActive
                      ? "bg-accent/80 text-foreground font-medium ring-1 ring-border/20"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <button
                    onClick={() => handleSelectSession(session.id)}
                    className="flex-1 flex items-start gap-2.5 text-left min-w-0 cursor-pointer"
                  >
                    <div className={cn("rounded p-1 shrink-0 mt-0.5", statusConfig.bg)}>
                      <StatusIcon className={cn("h-3.5 w-3.5", statusConfig.color)} />
                    </div>
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className="truncate text-sm pr-6 group-hover:text-foreground transition-colors font-medium">
                        {session.query}
                      </p>
                      <span className="text-[10px] text-muted-foreground/60 block font-mono">
                        {getRelativeTime(session.created_at)}
                      </span>
                    </div>
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSession(session.id);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-all duration-200 z-10"
                    title="Delete research history"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {!collapsed && sessions.length > 0 && (
          <div className="p-3 border-t border-border/10 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearHistory}
              className="w-full text-xs text-muted-foreground/60 hover:text-red-400 hover:bg-red-500/5 font-mono cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear History
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
