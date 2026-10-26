import type { IconName } from './components/Icon'

export const agentCategories = [
  {
    id: 'general-productivity',
    name: 'Algemeen & productiviteit',
    description: 'Meer overzicht in documenten, kennis en dagelijkse werkzaamheden.',
    icon: 'layers',
    displayOrder: 1,
  },
  {
    id: 'ecommerce-customer-service',
    name: 'E-commerce & klantenservice',
    description: 'Ondersteuning bij klantvragen, bestellingen en retourbeleid.',
    icon: 'cart',
    displayOrder: 2,
  },
  {
    id: 'finance-administration',
    name: 'Financiën & administratie',
    description: 'Inzicht in financiële documenten, berekeningen en administratie.',
    icon: 'receipt',
    displayOrder: 3,
  },
] as const satisfies readonly {
  id: string
  name: string
  description: string
  icon: IconName
  displayOrder: number
}[]

export type AgentCategoryId = (typeof agentCategories)[number]['id']
export type AgentScreen = 'comparison' | 'refund' | 'invoice' | 'support'

export interface AgentDefinition {
  id: string
  name: string
  description: string
  category: AgentCategoryId
  icon: IconName
  screen: AgentScreen
}

export const agents = [
  {
    id: 'document-comparison',
    name: 'Documentvergelijking agent',
    description:
      'Vergelijk documenten, herken wijzigingen en ontdek inhoudelijke verschillen met AI.',
    category: 'general-productivity',
    icon: 'layers',
    screen: 'comparison',
  },
  {
    id: 'refund-review',
    name: 'Retourbeoordeling agent',
    description:
      'Onderzoek retourverzoeken aan de hand van bedrijfsbeleid en fictieve bestelgegevens.',
    category: 'ecommerce-customer-service',
    icon: 'cart',
    screen: 'refund',
  },
  {
    id: 'invoice-processing',
    name: 'Factuurverwerking agent',
    description:
      'Extraheer factuurgegevens, controleer berekeningen en vergelijk met fictieve inkooporders.',
    category: 'finance-administration',
    icon: 'receipt',
    screen: 'invoice',
  },
  {
    id: 'customer-support',
    name: 'Klantenservice agent',
    description:
      'Analyze customer inquiries, retrieve relevant information, classify support tickets, and generate context-aware response suggestions.',
    category: 'ecommerce-customer-service',
    icon: 'headset',
    screen: 'support',
  },
] as const satisfies readonly AgentDefinition[]

export type AgentId = (typeof agents)[number]['id']

export function groupAgents(available: readonly AgentDefinition[] = agents) {
  return [...agentCategories]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((category) => ({
      ...category,
      agents: available.filter((agent) => agent.category === category.id),
    }))
}
