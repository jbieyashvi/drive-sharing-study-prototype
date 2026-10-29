// Local-only study event log. Nothing is persisted or transmitted.

import type { ScenarioId } from './model'

export type EventType =
  | 'screen_opened'
  | 'action_selected'
  | 'destination_chosen'
  | 'people_selection_changed'
  | 'recipient_selected'
  | 'role_selected'
  | 'review_opened'
  | 'confirmation'
  | 'simulated_success'
  | 'simulated_failure'
  | 'file_open_attempt'
  | 'facilitator'

/** Study variant: A is the original multi-step flow, B the shorter role-menu flow. */
export type Variant = 'A' | 'B'

export interface LogEntry {
  seq: number
  /** Milliseconds since session start (or last reset). Prototype timing only. */
  elapsedMs: number
  type: EventType
  detail: string
  viewer: string
  mode: 'participant' | 'facilitator'
  variant: Variant
  /** Facilitator-selected starting scenario. */
  scenario: ScenarioId
}

export type LogFn = (type: EventType, detail: string) => void
