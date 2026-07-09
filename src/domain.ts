export type IntegrationTarget = 'acelerador' | 'esl'
export type IntegrationType =
    | 'order'
    | 'customer'
    | 'product'
    | 'invoice'
    | 'payment'
    | 'shipping'
    | 'inventory'
    | 'other'

export type IntegrationEvent =
    | {
          type: 'integration-started'
          integrationTarget: IntegrationTarget
          integrationType: IntegrationType
      }
    | {
          type: 'integration-completed'
          integrationTarget: IntegrationTarget
          integrationType: IntegrationType
          integrationResult: 'success' | 'failure'
          integrationError?: string
      }

export const tripevents: IntegrationEvent[] = [
    {
        type: 'integration-completed',
        integrationTarget: 'acelerador',
        integrationType: 'order',
        integrationResult: 'failure',
        integrationError: 'Timeout ao acessar sistema externo'
    },
    {
        type: 'integration-completed',
        integrationTarget: 'acelerador',
        integrationType: 'order',
        integrationResult: 'success'
    },
    {
        type: 'integration-completed',
        integrationTarget: 'esl',
        integrationType: 'customer',
        integrationResult: 'failure',
        integrationError: 'Dados inválidos do cliente'
    },
    {
        type: 'integration-completed',
        integrationTarget: 'esl',
        integrationType: 'customer',
        integrationResult: 'success'
    }
]

export type IntegrationState = { status: 'success' | 'failure' | 'pending'; error?: string }

export const initialState: IntegrationState = { status: 'success' }

export const evolve = (
    state: IntegrationState,
    event: IntegrationEvent
): IntegrationState => {
    if (event.type === 'integration-started') {
        return { status: 'pending' }
    }

    if (event.integrationResult === 'success') {
        return { status: 'success' }
    }

    return { status: 'failure', error: event.integrationError }
}

// Reduz todos os eventos até o estado global de integração.
export const reduceState = (events: IntegrationEvent[]): IntegrationState =>
    events.reduce(evolve, initialState)

export type ScanStep = { event: IntegrationEvent; state: IntegrationState }

// Igual ao reduce, mas retorna o estado após CADA evento — útil para
// visualizar a sequência de eventos que levou ao estado final.
export const scanState = (events: IntegrationEvent[]): ScanStep[] => {
    const steps: ScanStep[] = []
    let current = initialState
    for (const event of events) {
        current = evolve(current, event)
        steps.push({ event, state: current })
    }
    return steps
}

// Reduz os eventos por alvo para obter o estado de cada integração encontrada.
export const stateByTarget = (
    events: IntegrationEvent[]
): Record<string, IntegrationState> => {
    const targets = Array.from(new Set(events.map((e) => e.integrationTarget)))
    const result = {} as Record<string, IntegrationState>
    for (const target of targets) {
        const targetEvents = events.filter((e) => e.integrationTarget === target)
        result[target] = targetEvents.reduce(evolve, initialState)
    }
    return result
}

const result = reduceState(tripevents)
console.log(result)
