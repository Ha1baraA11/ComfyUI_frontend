import { defineStore } from 'pinia'

/**
 * Doc node ids the CRDT follower has ever observed, per workflow, for as
 * long as this Pinia instance lives -- which outlives any single
 * `useAgentCrdtFollower` composable mount. A node the remote doc held and
 * then deleted while this client was unmounted (a panel close/reopen, a
 * component remount) must stay excluded from `localOnlyNodeIds`'
 * local-only classification even though the remounted composable's own
 * in-memory state starts fresh; this store is what lets it stay excluded.
 *
 * A genuinely new page load creates a new Pinia instance (and therefore a
 * new, empty history), so a node the doc deleted before this client ever
 * connected can still be misclassified -- that cold-start limit is a
 * property of client-side state, not something this store can close.
 */
export const useAgentCrdtDocHistoryStore = defineStore(
  'agentCrdtDocHistory',
  () => {
    const everSeenByWorkflow = new Map<string, Set<string>>()

    function remember(workflowId: string, ids: ReadonlySet<string>): void {
      const seen = everSeenByWorkflow.get(workflowId) ?? new Set<string>()
      for (const id of ids) seen.add(id)
      everSeenByWorkflow.set(workflowId, seen)
    }

    function everSeen(workflowId: string): ReadonlySet<string> {
      return everSeenByWorkflow.get(workflowId) ?? new Set<string>()
    }

    /** Explicit lineage reset only -- see `AgentCrdtDocLifecycle`. */
    function clear(workflowId: string): void {
      everSeenByWorkflow.delete(workflowId)
    }

    return { remember, everSeen, clear }
  }
)
