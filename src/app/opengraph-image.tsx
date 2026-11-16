import { ImageResponse } from 'next/og'

export const alt = 'Aesthetic AI: AI simulation of aesthetic surgery on your own photo'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: '#080808',
          color: '#ffffff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 26, letterSpacing: 6 }}>
          <div style={{ width: 30, height: 30, borderRadius: 30, border: '2px solid #fff', marginRight: 18, display: 'flex' }} />
          AESTHETIC AI
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 86, lineHeight: 1.02, letterSpacing: -3, maxWidth: 900 }}>Discover Your Future Appearance.</div>
          <div style={{ marginTop: 28, fontSize: 30, color: '#929292' }}>AI simulation of 12 aesthetic procedures on your own photo.</div>
        </div>
      </div>
    ),
    size,
  )
}
