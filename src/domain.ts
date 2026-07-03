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

export type IntegrationEvent = {
    integrationTarget: IntegrationTarget
    integrationType: IntegrationType
    integrationResult: 'success' | 'failure'
    integrationError?: string
}

export const tripevents: IntegrationEvent[] = [
    {
        integrationTarget: 'acelerador',
        integrationType: 'order',
        integrationResult: 'failure',
        integrationError: 'Timeout ao acessar sistema externo'
    },
    {
        integrationTarget: 'acelerador',
        integrationType: 'order',
        integrationResult: 'success'
    },
    {
        integrationTarget: 'esl',
        integrationType: 'customer',
        integrationResult: 'failure',
        integrationError: 'Dados inválidos do cliente'
    },
    {
        integrationTarget: 'esl',
        integrationType: 'customer',
        integrationResult: 'success'
    }
]

export type IntegrationState = { status: 'success' | 'failure'; error?: string }

export const initialState: IntegrationState = { status: 'success' }

export const evolve = (
    state: IntegrationState,
    event: IntegrationEvent
): IntegrationState => {
    if (event.integrationResult === 'success') {
        return { status: 'success' }
    } else {
        return { status: 'failure', error: event.integrationError }
    }
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

// Reduz os eventos por alvo (Acelerador / ESL) para obter o estado de cada integração.
export const stateByTarget = (
    events: IntegrationEvent[]
): Record<IntegrationTarget, IntegrationState> => {
    const targets: IntegrationTarget[] = ['acelerador', 'esl']
    const result = {} as Record<IntegrationTarget, IntegrationState>
    for (const target of targets) {
        const targetEvents = events.filter((e) => e.integrationTarget === target)
        result[target] = targetEvents.reduce(evolve, initialState)
    }
    return result
}

const result = reduceState(tripevents)
console.log(result)
