import { useSyncExternalStore } from 'react'
import { agentCategories, agents } from './agents'
import type { AgentCategoryId, AgentId } from './agents'

export type AppRoute =
  | { view: 'chat' }
  | { view: 'library'; category?: AgentCategoryId }
  | { view: 'agent'; agentId: AgentId }

export function parseRoute(hash: string): AppRoute {
  const path = hash.replace(/^#/, '').replace(/\/$/, '')
  if (path === '/agents') return { view: 'library' }
  const category = agentCategories.find((c) => path === `/agents/category/${c.id}`)
  if (category) return { view: 'library', category: category.id }
  const agent = agents.find((a) => path === `/agents/${a.id}`)
  if (agent) return { view: 'agent', agentId: agent.id }
  return { view: 'chat' }
}

export function routeHref(route: AppRoute): string {
  if (route.view === 'chat') return '#/chat'
  if (route.view === 'agent') return `#/agents/${route.agentId}`
  return route.category ? `#/agents/category/${route.category}` : '#/agents'
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

// Native hash links give this client-only Vite app history and deep links,
// without a router dependency or server-side route rewrites.
export function useNavigation(): AppRoute {
  return parseRoute(
    useSyncExternalStore(
      subscribe,
      () => window.location.hash,
      () => '',
    ),
  )
}
