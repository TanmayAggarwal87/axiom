import { stateReducer } from "../reducer";
import type { SessionState, SessionEvent, SessionBudget } from "../types";

async function run() {
  const sessionId = "session-1786419013715-ze8k19frj";
  
  const budget: SessionBudget = {
    sessionId,
    totalUsdc: 0.5,
    spentUsdc: 0,
    maxFactCheckIterations: 2,
    maxDynamicTasks: 3
  };

  const initialEvent: SessionEvent = {
    id: 'evt-init-1786419014340-ix6qn1mwz',
    sessionId,
    type: 'budget_capped',
    payload: { maxDynamicTasks: 3, maxFactCheckIterations: 2 },
    createdAt: '2026-08-11T03:30:14.34+00:00'
  };

  let state: SessionState = {
    sessionId,
    tasks: [],
    evidence: [],
    claims: [],
    budget,
    payments: [],
    events: [initialEvent]
  };

  const spawnEvent: SessionEvent = {
    id: 'evt-spawn-1786419020921-3ogcw564a',
    sessionId,
    type: 'task_spawned',
    payload: {
      id: 'search-quantum-breakthroughs',
      type: 'search',
      input: 'Search for recent industry breakthroughs, hardware milestones, and commercial announcements in quantum computing from 2023 to present.',
      result: null,
      status: 'ready',
      createdBy: 'orchestrator',
      dependsOn: [],
      sessionId: 'session-1786419013715-ze8k19frj'
    },
    createdAt: '2026-08-11T03:30:20.921+00:00'
  };

  console.log("State before task_spawned:", JSON.stringify(state, null, 2));
  const nextState = stateReducer(state, spawnEvent);
  console.log("State after task_spawned:", JSON.stringify(nextState, null, 2));
}

run();
