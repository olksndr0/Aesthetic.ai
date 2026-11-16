/** How a piece of data came to be: measured, inferred, or changed by the simulation. */
export type MarkerStatus = 'acquired' | 'estimated' | 'modified'

export const STATUS_COLOURS: Record<MarkerStatus, string> = { acquired: '#ffffff', estimated: '#ffb454', modified: '#7fb2ff' }
