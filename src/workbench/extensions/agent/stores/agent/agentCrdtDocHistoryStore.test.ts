import { describe, expect, it } from 'vitest'

import { useAgentCrdtDocHistoryStore } from './agentCrdtDocHistoryStore'

describe('agentCrdtDocHistoryStore', () => {
  it('accumulates observed ids across separate remember calls, scoped per workflow', () => {
    const history = useAgentCrdtDocHistoryStore()
    history.remember('wf-1', new Set(['1']))
    history.remember('wf-1', new Set(['2']))
    history.remember('wf-2', new Set(['9']))

    expect(history.everSeen('wf-1')).toEqual(new Set(['1', '2']))
    expect(history.everSeen('wf-2')).toEqual(new Set(['9']))
  })

  it('answers an empty set for a workflow it has never observed', () => {
    const history = useAgentCrdtDocHistoryStore()

    expect(history.everSeen('unknown')).toEqual(new Set())
  })

  it('outlives a fresh useStore() call, unlike composable-local state', () => {
    const first = useAgentCrdtDocHistoryStore()
    first.remember('wf-1', new Set(['1']))

    const second = useAgentCrdtDocHistoryStore()

    expect(second.everSeen('wf-1')).toEqual(new Set(['1']))
  })

  it('clears only the named workflow on an explicit lineage reset', () => {
    const history = useAgentCrdtDocHistoryStore()
    history.remember('wf-1', new Set(['1']))
    history.remember('wf-2', new Set(['9']))

    history.clear('wf-1')

    expect(history.everSeen('wf-1')).toEqual(new Set())
    expect(history.everSeen('wf-2')).toEqual(new Set(['9']))
  })
})
