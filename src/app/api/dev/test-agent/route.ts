import { NextResponse } from "next/server";
import { runAgent } from "@/agents/run-agent";
import { MockPaidFetcher } from "@/agents/mocks/mock-paid-fetcher";
import { MockStateWriter } from "@/agents/mocks/mock-state-writer";
import type { Task } from "@/agents/types";

/**
 * Development-only Route Handler for testing Module 2 agents.
 * 
 * SECURITY: Returns 404 in production environments.
 * forcePaid is a DEV-ONLY parameter for testing the Academic Agent paid path.
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 });
  }

  try {
    const body = await req.json();
    const { type, input, forcePaid } = body;

    if (!type || !input) {
      return NextResponse.json(
        { error: 'Missing required body fields "type" and "input"' },
        { status: 400 }
      );
    }

    const task: Task = {
      id: `dev-task-${Date.now()}`,
      sessionId: `dev-session-${Date.now()}`,
      type,
      input,
      dependsOn: [],
      status: "ready",
      createdBy: "orchestrator",
      result: null,
    };

    const mockPaidFetcher = new MockPaidFetcher();
    const mockStateWriter = new MockStateWriter();

    // forcePaid is DEV-ONLY and restricted to local testing
    const forcePaidUrl =
      forcePaid && type === "academic"
        ? "https://doi.org/10.1016/j.jep.2023.116543"
        : undefined;

    const result = await runAgent(task, {
      paidFetcher: mockPaidFetcher,
      stateWriter: mockStateWriter,
      forcePaidFetchUrl: forcePaidUrl,
    });

    return NextResponse.json({
      success: true,
      task,
      result,
      submittedToStateWriter: mockStateWriter.submittedResults.length > 0,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Agent execution failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 });
  }
  return NextResponse.json({
    status: "active",
    environment: "development",
    message: "Module 2 dev agent endpoint is ready. Use POST to execute tasks.",
  });
}
