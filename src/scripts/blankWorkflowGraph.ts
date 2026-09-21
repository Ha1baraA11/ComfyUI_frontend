import type { ComfyWorkflowJSON } from '@/platform/workflow/validation/schemas/workflowSchema'

/**
 * The empty workflow document. Kept in its own leaf module (no runtime
 * imports, so no `import.meta.env` read at module scope) so both
 * `defaultGraph.ts` and environment-free consumers such as Playwright
 * fixtures can import the same value instead of hand-maintaining copies.
 */
export const blankWorkflowGraph: ComfyWorkflowJSON = {
  last_node_id: 0,
  last_link_id: 0,
  nodes: [],
  links: [],
  groups: [],
  config: {},
  extra: {},
  version: 0.4
}
