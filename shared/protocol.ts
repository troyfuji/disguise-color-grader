// Messages between the browser panels and the colour-grader server (WebSocket on PANEL_WS_PATH).
// Panels never talk to disguise. The server owns the single Live Update connection, all
// Python calls, layer selection and the API budget.

import type { GradeState } from './grade/types.ts'
import type { Preset } from './presets.ts'

export const PANEL_WS_PATH = '/api/panel'

export type DirectorStatus = 'offline' | 'connecting' | 'connected'

export interface LayerInfo {
  uid: string
  name: string
  track: string
}

export interface SessionState {
  director: { address: string; status: DirectorStatus }
  /** ColourAdjust layers live at the playhead (FR5). */
  liveLayers: LayerInfo[]
  /** The only layer the server will write to (FR6). Never changed by the server on its own. */
  selected: LayerInfo | null
  /** Selected layer is still live at the playhead; false locks every panel (FR8). */
  selectedLive: boolean
  /** Values of the selected layer have been read since the last select / reconnect (FR4). */
  ready: boolean
  bypass: boolean
  /**
   * Increments on every layer change and every Director reconnect. Panels go back to Safe
   * when it changes (FR22), and the server ignores edits sent for an older epoch, so a drag
   * that spans a layer switch can never land on the new layer.
   */
  layerEpoch: number
}

export type GesturePhase = 'begin' | 'move' | 'end' | 'commit'

/** Panel → server */
export type PanelMessage =
  | { type: 'connect'; address: string }
  | { type: 'disconnect' }
  | { type: 'refresh' }
  | { type: 'selectLayer'; uid: string }
  | { type: 'grade'; grade: GradeState; phase: GesturePhase; layerEpoch: number }
  | { type: 'bypass'; on: boolean; layerEpoch: number }
  // Presets live on the server; none of these touch disguise. Applying a preset is an
  // ordinary 'grade' commit from the panel.
  | { type: 'presetSave'; name: string; grade: GradeState }
  | { type: 'presetUpdate'; id: string; grade: GradeState }
  | { type: 'presetRename'; id: string; name: string }
  | { type: 'presetDelete'; id: string }

export type GradeOrigin = 'load' | 'panel' | 'designer'

/** Server → panel */
export type ServerMessage =
  | { type: 'hello'; panelId: string; version: string }
  | { type: 'session'; session: SessionState }
  | { type: 'grade'; grade: GradeState; origin: GradeOrigin; layerEpoch: number; levelsRebuilt?: boolean }
  | { type: 'notice'; level: 'info' | 'warn' | 'error'; text: string }
  | { type: 'presets'; presets: Preset[] }

export const DIRECTOR_ADDRESS_RE = /^[A-Za-z0-9.-]+(:\d{1,5})?$/
