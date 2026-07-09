import {
    tripevents,
    reduceState,
    stateByTarget,
    scanState,
    withStarted,
    type IntegrationEvent,
    type IntegrationTarget,
    type IntegrationState
} from './src/domain.ts'

// Status usado apenas pela UI. 'pending' é um estado transitório do fluxo
// (etapa "Enviando dados") que não é representado por um evento concluído.
type DisplayStatus = 'success' | 'pending' | 'failure'

const TARGET_LABELS: Record<string, string> = {
    acelerador: 'Acelerador',
    esl: 'TMS Externo'
}

const STATUS_ICON: Record<DisplayStatus, string> = {
    success: '✓',
    pending: '↻',
    failure: '✕'
}

/* ------------------------------------------------------------------ */
/* Legenda de estados (reprodução do screenshot)                      */
/* ------------------------------------------------------------------ */

const STATE_LEGEND: {
    status: DisplayStatus
    icon: string
    title: string
    description: string
}[] = [
    {
        status: 'success',
        icon: '🌐',
        title: 'Dados enviados com sucesso',
        description: 'Indica integrações que estão sincronizadas'
    },
    {
        status: 'pending',
        icon: '🔄',
        title: 'Enviando dados',
        description: 'Indica integrações que estão recebendo dados'
    },
    {
        status: 'failure',
        icon: '✕',
        title: 'Dados não enviados',
        description: 'Indica integrações em que ocorreu erro ao sincronizar'
    }
]

// target: string -> function integrationRow
function integrationRow(target: string, status: DisplayStatus): string {
    return `
        <div class="integration integration--${status}">
            <span class="integration__icon">${STATUS_ICON[status]}</span>
            <span class="integration__name">${TARGET_LABELS[target] || target}</span>
        </div>`
}

function legendCard(item: (typeof STATE_LEGEND)[number]): string {
    // Para a legenda, ainda precisamos de targets. Vamos usar os conhecidos.
    const targets: string[] = ['acelerador', 'esl']
    const rows = targets
        .map((target) => integrationRow(target, item.status))
        .join('')

    return `
        <div class="scenario scenario--${item.status}">
            <div class="scenario__header">
                <span class="scenario__icon">${item.icon}</span>
                <span class="scenario__title">${item.title}</span>
            </div>
            <div class="scenario__card">
                <div class="scenario__card-label">Integrações externas:</div>
                ${rows}
            </div>
            <div class="scenario__connector"></div>
            <div class="scenario__description">${item.description}</div>
        </div>`
}

/* ------------------------------------------------------------------ */
/* Cenários orientados a eventos                                      */
/* ------------------------------------------------------------------ */

type Scenario = {
    name: string
    description: string
    events: IntegrationEvent[]
}

const SCENARIOS: Scenario[] = [
    {
        name: 'Tudo sincronizado',
        description: 'Ambas as integrações concluíram com sucesso.',
        events: [
            { type: 'integration-completed', integrationTarget: 'acelerador', integrationType: 'order', integrationResult: 'success' },
            { type: 'integration-completed', integrationTarget: 'esl', integrationType: 'customer', integrationResult: 'success' }
        ]
    },
    {
        name: 'Falha só no Acelerador',
        description: 'O Acelerador falhou; o TMS Externo seguiu sincronizado.',
        events: [
            {
                type: 'integration-completed',
                integrationTarget: 'acelerador',
                integrationType: 'order',
                integrationResult: 'failure',
                integrationError: 'Timeout ao acessar sistema externo'
            },
            { type: 'integration-started', integrationTarget: 'esl', integrationType: 'customer'},
            { type: 'integration-completed', integrationTarget: 'esl', integrationType: 'other', integrationResult: 'success', integrationError: 'Erro ao acessar sistema externo' }

        ]
    },
    {
        name: 'Falha total',
        description: 'As duas integrações terminaram em erro.',
        events: [
            {
                type: 'integration-completed',
                integrationTarget: 'acelerador',
                integrationType: 'invoice',
                integrationResult: 'failure',
                integrationError: 'Serviço indisponível (503)'
            },
            {
                type: 'integration-completed',
                integrationTarget: 'esl',
                integrationType: 'shipping',
                integrationResult: 'failure',
                integrationError: 'Credenciais inválidas'
            }
        ]
    },
    {
        name: 'Recuperação após falha',
        description: 'Houve falha, mas um reenvio posterior teve sucesso (o último evento vence).',
        events: [
            {
                type: 'integration-completed',
                integrationTarget: 'acelerador',
                integrationType: 'payment',
                integrationResult: 'failure',
                integrationError: 'Conexão recusada'
            },
            { type: 'integration-completed', integrationTarget: 'acelerador', integrationType: 'payment', integrationResult: 'success' },
            {
                type: 'integration-completed',
                integrationTarget: 'esl',
                integrationType: 'inventory',
                integrationResult: 'failure',
                integrationError: 'Estoque bloqueado'
            },
            { type: 'integration-completed', integrationTarget: 'esl', integrationType: 'inventory', integrationResult: 'success' }
        ]
    },
    {
        name: 'Estado de processando',
        description: 'Uma integração está em processamento.',
        events: [
            {
                type: 'integration-started',
                integrationTarget: 'acelerador',
                integrationType: 'customer'
            }
        ]
    },
    {
        name: 'Eventos originais (index.ts)',
        description: 'O conjunto de eventos definido em tripevents.',
        events: tripevents
    },
    {
        name: 'Sem eventos',
        description: 'Nenhum evento recebido — permanece no estado inicial.',
        events: []
    }
].map((scenario) => ({ ...scenario, events: withStarted(scenario.events) }))

function toDisplay(state: IntegrationState): DisplayStatus {
    if(state.status === 'success') return 'success'
    return state.status === 'failure' ? 'failure' : 'pending'
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

// Monta o JSON puro que documenta a entrada (eventos) e a derivação do status.
function derivationJson(events: IntegrationEvent[]): string {
    const targets = Array.from(new Set(events.map((e) => e.integrationTarget)))
    const derivation = {
        // Entrada: os eventos recebidos, na ordem.
        events,
        // Como o status é derivado por alvo: aplicamos `evolve` a cada evento
        // e registramos o estado resultante (scanState).
        derivacaoPorAlvo: Object.fromEntries(
            targets.map((target) => {
                const targetEvents = events.filter((e) => e.integrationTarget === target)
                return [
                    TARGET_LABELS[target] || target,
                    {
                        passos: scanState(targetEvents).map((step, i) => ({
                            passo: i + 1,
                            evento: step.event,
                            estadoResultante: step.state
                        })),
                        estadoFinal: stateByTarget(events)[target]
                    }
                ]
            })
        ),
        // Estado global: reduce de TODOS os eventos (o último evento vence).
        estadoGlobal: reduceState(events)
    }

    return escapeHtml(JSON.stringify(derivation, null, 2))
}

function scenarioCard(scenario: Scenario, index: number): string {
    const byTarget = stateByTarget(scenario.events)
    const targets = Object.keys(byTarget)
    const global = reduceState(scenario.events)
    const globalDisplay = toDisplay(global)

    const rows = targets
        .map((target) => {
            const display = toDisplay(byTarget[target])
            return `
                <div class="integration integration--${display}">
                    <span class="integration__icon">${STATUS_ICON[display]}</span>
                    <span class="integration__name">${TARGET_LABELS[target] || target}</span>
                </div>`
        })
        .join('')

    return `
        <div class="scn scn--${globalDisplay}">
            <div class="scn__head">
                <span class="scn__name">${scenario.name}</span>
                <span class="badge badge--${globalDisplay}">${global.status}</span>
            </div>
            <p class="scn__desc">${scenario.description}</p>
            <div class="scn__targets">${rows}</div>
            <button class="scn__toggle" type="button" data-scn="${index}" aria-expanded="false">
                Ver eventos (${scenario.events.length})
            </button>
            <div class="scn__events" id="scn-events-${index}" hidden><pre>${derivationJson(scenario.events)}</pre></div>
        </div>`
}

/* ------------------------------------------------------------------ */
/* Render + interação                                                 */
/* ------------------------------------------------------------------ */

function render(): void {
    const legendEl = document.getElementById('scenarios')
    if (legendEl) {
        legendEl.innerHTML = STATE_LEGEND.map(legendCard).join('')
    }

    const scenariosEl = document.getElementById('event-scenarios')
    if (scenariosEl) {
        scenariosEl.innerHTML = SCENARIOS.map(scenarioCard).join('')
        scenariosEl.addEventListener('click', (ev) => {
            const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('.scn__toggle')
            if (!btn) return
            const panel = document.getElementById(`scn-events-${btn.dataset.scn}`)
            if (!panel) return
            const open = !panel.hasAttribute('hidden')
            if (open) {
                panel.setAttribute('hidden', '')
            } else {
                panel.removeAttribute('hidden')
            }
            btn.setAttribute('aria-expanded', String(!open))
            btn.textContent = `${open ? 'Ver' : 'Ocultar'} eventos (${
                SCENARIOS[Number(btn.dataset.scn)]?.events.length ?? 0
            })`
        })
    }
}

render()
