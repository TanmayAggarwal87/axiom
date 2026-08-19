"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { LiveSessionView } from "@/components/research/LiveSessionView";
import { ReportView } from "@/components/report/ReportView";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  XCircle,
  AlertTriangle,
  ArrowLeft,
  Loader2,
  FileText,
  Lock,
} from "lucide-react";
import type { SessionState } from "@/lib/orchestrator/types";

type SessionStatus = "in_progress" | "completed" | "failed" | "unauthorized" | "not_found";

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  
  const sessionId = params?.sessionId as string;

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SessionStatus>("in_progress");
  const [query, setQuery] = useState("");
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [precompiledReport, setPrecompiledReport] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setStatus("unauthorized");
      setLoading(false);
      return;
    }

    async function loadSession() {
      try {
        setLoading(true);
        setErrorMsg(null);

        // Fetch session state and metadata
        const res = await fetch(`/api/research/session/${sessionId}`);
        
        if (res.status === 403) {
          setStatus("unauthorized");
          setLoading(false);
          return;
        }
        if (res.status === 404) {
          setStatus("not_found");
          setLoading(false);
          return;
        }
        if (!res.ok) {
          throw new Error(`Failed to load session details (HTTP ${res.status})`);
        }

        const data = await res.json();
        if (data.success) {
          setQuery(data.query);
          setStatus(data.status);
          setSessionState(data.state);

          // If the session is already completed, load the precompiled report from DB
          if (data.status === "completed") {
            const reportRes = await fetch(`/api/research/session/${sessionId}/report`);
            if (reportRes.ok) {
              const reportData = await reportRes.json();
              if (reportData.success && reportData.report) {
                setPrecompiledReport(reportData.report);
              }
            }
          }
        } else {
          throw new Error(data.error || "Unknown error");
        }
      } catch (err: any) {
        setErrorMsg(err.message || "Failed to load session");
        setStatus("failed");
      } finally {
        setLoading(false);
      }
    }

    loadSession();
  }, [sessionId, isLoaded, isSignedIn]);

  function handleNewResearch() {
    router.push("/");
  }

  if (loading) {
    return (
      <div className="w-full max-w-4xl mx-auto space-y-6 py-12 px-4 animate-pulse">
        <div className="space-y-3 text-center">
          <Skeleton className="h-4 w-48 mx-auto rounded-full" />
          <Skeleton className="h-8 w-80 mx-auto rounded-lg" />
          <Skeleton className="h-4 w-60 mx-auto rounded-md" />
        </div>
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (status === "unauthorized") {
    return (
      <div className="w-full max-w-md mx-auto py-24 px-4">
        <Card className="border-red-500/20 bg-red-500/[0.02] p-6 text-center space-y-4">
          <div className="mx-auto rounded-full bg-red-500/10 p-3 w-12 h-12 flex items-center justify-center">
            <Lock className="h-6 w-6 text-red-400" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-foreground">Access Denied</h3>
            <p className="text-sm text-muted-foreground">
              You do not have permission to view this research session.
            </p>
          </div>
          <Button onClick={handleNewResearch} variant="outline" className="w-full gap-1.5 cursor-pointer">
            <ArrowLeft className="h-4 w-4" />
            Back to Safety
          </Button>
        </Card>
      </div>
    );
  }

  if (status === "not_found") {
    return (
      <div className="w-full max-w-md mx-auto py-24 px-4">
        <Card className="border-border/30 bg-card/50 p-6 text-center space-y-4">
          <div className="mx-auto rounded-full bg-muted p-3 w-12 h-12 flex items-center justify-center">
            <XCircle className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-foreground">Session Not Found</h3>
            <p className="text-sm text-muted-foreground">
              The research session you are looking for does not exist.
            </p>
          </div>
          <Button onClick={handleNewResearch} variant="outline" className="w-full gap-1.5 cursor-pointer">
            <ArrowLeft className="h-4 w-4" />
            New Research
          </Button>
        </Card>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="w-full max-w-md mx-auto py-24 px-4">
        <Card className="border-red-500/30 bg-red-500/5 p-6 text-center space-y-4">
          <div className="mx-auto rounded-full bg-red-500/10 p-3 w-12 h-12 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-red-400" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-red-400">Research Failed</h3>
            <p className="text-sm text-red-300/80">
              {errorMsg || "This research session didn't complete successfully."}
            </p>
          </div>
          <Button onClick={handleNewResearch} variant="outline" className="w-full gap-1.5 cursor-pointer">
            <ArrowLeft className="h-4 w-4" />
            New Research
          </Button>
        </Card>
      </div>
    );
  }

  // Completed session: render the static compiled report
  if (status === "completed" && precompiledReport) {
    return (
      <div className="py-6 px-4 w-full">
        <ReportView
          precompiledReport={precompiledReport}
          onNewResearch={handleNewResearch}
        />
      </div>
    );
  }

  // Fallback for completion transition (e.g. if we finished live and transitioned)
  if (status === "completed" && sessionState) {
    return (
      <div className="py-6 px-4 w-full">
        <ReportView
          state={sessionState}
          query={query}
          onNewResearch={handleNewResearch}
        />
      </div>
    );
  }

  // In progress session: show live updates view
  return (
    <div className="py-6 px-4 w-full">
      <LiveSessionView
        sessionId={sessionId}
        onComplete={(finalState) => {
          setSessionState(finalState);
          setStatus("completed");
        }}
      />
    </div>
  );
}
