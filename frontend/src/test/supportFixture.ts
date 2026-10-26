import type { SupportResponse } from '../types'

export const supportResult: SupportResponse = {
  document_id: null,
  status: 'completed',
  error: null,
  human_review_required: true,
  disclaimer: 'Conceptvoorstellen met fictieve gegevens. Menselijke controle is nodig.',
  tool_call_limit: 6,
  analysis: {
    ticket_category: 'Product Information',
    suggested_priority: 'medium',
    priority_reason: 'Een informatieve productvraag.',
    priority_basis: 'model_suggestion',
    priority_rule_ids: [],
    short_summary: 'De klant wil twee monitoren aansluiten.',
    customer_intent: 'Compatibiliteit controleren.',
    relevant_information: [
      {
        information: 'Twee externe monitoren via HDMI en USB-C.',
        reference_ids: ['product:LAP-204'],
      },
    ],
    missing_information: [],
    recommended_next_action: 'Controleer aansluitingen en kabels.',
    escalation: {
      recommended: false,
      reason: 'Geen aanleiding bekend.',
      basis: 'model_suggestion',
      rule_ids: [],
    },
    suggested_customer_response: 'De LAP-204 ondersteunt twee externe monitoren via HDMI en USB-C.',
  },
  sources: [],
  data_references: [
    {
      reference_id: 'product:LAP-204',
      kind: 'product',
      label: 'Nexora Travel Laptop',
      data: { availability: null, external_monitors: 'Twee monitoren' },
    },
  ],
  tool_calls: [
    {
      sequence: 1,
      name: 'get_product_information',
      status: 'success',
      message: 'Fictieve productinformatie opgehaald.',
    },
  ],
}
