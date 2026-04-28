import type { StoryUnit, Beat } from './types'

const VERB_COLORS: Record<string, string> = {
  DO: '#e86a2f',
  SEE: '#5b8db8',
  HEAR: '#7bb58a',
  TASTE: '#c8a96e',
  DRINK: '#9b7bb5',
  BUY: '#b57b7b',
}

const SLIDE_W = 1920
const SLIDE_H = 1080

function SlideFrame({ children, bg = '#0f1116' }: { children: React.ReactNode; bg?: string }) {
  return (
    <div
      style={{
        width: SLIDE_W,
        height: SLIDE_H,
        background: bg,
        position: 'relative',
        overflow: 'hidden',
        fontFamily: '"Source Han Serif", "Noto Serif SC", "Songti SC", serif',
        color: '#f5f0e6',
      }}
    >
      {children}
    </div>
  )
}

function MoodSlide({ story }: { story: StoryUnit }) {
  return (
    <SlideFrame>
      {story.mood_image_url && (
        <img
          src={story.mood_image_url}
          alt=""
          crossOrigin="anonymous"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(15,17,22,0.15) 0%, rgba(15,17,22,0.55) 60%, rgba(15,17,22,0.92) 100%)',
        }}
      />
      <div style={{ position: 'absolute', top: 80, left: 100, fontSize: 18, letterSpacing: 8, color: '#c8a96e' }}>
        HOTEL INDIGO
      </div>
      <div style={{ position: 'absolute', bottom: 220, left: 100, right: 100 }}>
        <div style={{ fontSize: 28, letterSpacing: 14, color: '#c8a96e', marginBottom: 24, textTransform: 'uppercase' }}>
          {story.signature.en}
        </div>
        <div style={{ fontSize: 144, fontWeight: 300, lineHeight: 1.05, letterSpacing: 12 }}>
          {story.signature.zh}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 80,
          left: 100,
          right: 100,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 18,
          color: '#a8a397',
          letterSpacing: 4,
        }}
      >
        <span>{story.city.toUpperCase()} · {story.neighborhood.toUpperCase()}</span>
        <span>NEIGHBORHOOD STORY</span>
      </div>
    </SlideFrame>
  )
}

function HookSlide({ story }: { story: StoryUnit }) {
  return (
    <SlideFrame bg="#13161c">
      <div style={{ position: 'absolute', top: 120, left: 140, fontSize: 16, letterSpacing: 6, color: '#c8a96e' }}>
        STREET ENTRANCE
      </div>
      <div
        style={{
          position: 'absolute',
          top: 200,
          left: 140,
          width: 4,
          height: 80,
          background: '#c8a96e',
        }}
      />
      <div style={{ position: 'absolute', top: 300, left: 140, right: 140 }}>
        <div style={{ fontSize: 88, fontWeight: 300, lineHeight: 1.15, marginBottom: 56 }}>
          {story.hook_line}
        </div>
        <div style={{ fontSize: 28, color: '#a8a397', letterSpacing: 2, fontWeight: 300 }}>
          {story.anchor}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 100,
          left: 140,
          fontSize: 220,
          fontWeight: 200,
          color: 'rgba(200,169,110,0.08)',
          lineHeight: 0.9,
          letterSpacing: 16,
        }}
      >
        {story.neighborhood}
      </div>
    </SlideFrame>
  )
}

function BeatSlide({ beat, index, story }: { beat: Beat; index: number; story: StoryUnit }) {
  const accent = VERB_COLORS[beat.verb] ?? '#c8a96e'
  return (
    <SlideFrame bg="#0f1116">
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 960 }}>
        {beat.image_url ? (
          <img
            src={beat.image_url}
            alt=""
            crossOrigin="anonymous"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', background: '#1a1d24' }} />
        )}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, rgba(15,17,22,0) 60%, rgba(15,17,22,0.6) 100%)',
          }}
        />
      </div>
      <div style={{ position: 'absolute', left: 1040, top: 140, right: 120, bottom: 120 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 60 }}>
          <span style={{ width: 48, height: 2, background: accent }} />
          <span style={{ fontSize: 18, letterSpacing: 8, color: accent, fontWeight: 600 }}>
            {beat.verb}
          </span>
          <span style={{ fontSize: 18, color: '#6b7280', letterSpacing: 4 }}>
            {String(index + 1).padStart(2, '0')} / {String(story.beats.length).padStart(2, '0')}
          </span>
        </div>
        <div style={{ fontSize: 72, fontWeight: 300, lineHeight: 1.2, marginBottom: 40, letterSpacing: 4 }}>
          {beat.title}
        </div>
        <div style={{ fontSize: 30, lineHeight: 1.5, color: '#e8e2d4', marginBottom: 48, fontWeight: 300 }}>
          {beat.copy}
        </div>
        {beat.detail && (
          <div
            style={{
              fontSize: 22,
              lineHeight: 1.85,
              color: '#a8a397',
              fontWeight: 300,
              borderLeft: `2px solid ${accent}`,
              paddingLeft: 28,
              marginBottom: 56,
            }}
          >
            {beat.detail}
          </div>
        )}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 32,
            fontSize: 16,
            color: '#6b7280',
            letterSpacing: 2,
          }}
        >
          {beat.sensory.slice(0, 4).map((s, i) => (
            <span key={i}>· {s.description}</span>
          ))}
        </div>
      </div>
    </SlideFrame>
  )
}

function ActionSlide({ story }: { story: StoryUnit }) {
  return (
    <SlideFrame bg="#0f1116">
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 200,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 16, letterSpacing: 10, color: '#c8a96e', marginBottom: 80 }}>
          STEP OUT
        </div>
        <div style={{ width: 80, height: 1, background: '#c8a96e', marginBottom: 80 }} />
        <div style={{ fontSize: 64, fontWeight: 300, lineHeight: 1.4, letterSpacing: 4 }}>
          {story.action_cue}
        </div>
        <div style={{ width: 80, height: 1, background: '#c8a96e', marginTop: 80 }} />
      </div>
    </SlideFrame>
  )
}

function ClosingSlide({ story }: { story: StoryUnit }) {
  return (
    <SlideFrame bg="#0f1116">
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <div style={{ fontSize: 96, fontWeight: 300, letterSpacing: 12, marginBottom: 32 }}>
          {story.signature.zh}
        </div>
        <div style={{ fontSize: 18, letterSpacing: 8, color: '#c8a96e', marginBottom: 80 }}>
          {story.signature.en.toUpperCase()}
        </div>
        <div style={{ width: 1, height: 80, background: '#2a2a28', marginBottom: 32 }} />
        <div style={{ fontSize: 16, letterSpacing: 6, color: '#6b7280' }}>
          HOTEL INDIGO · {story.city.toUpperCase()} · {story.neighborhood.toUpperCase()}
        </div>
      </div>
    </SlideFrame>
  )
}

export function SlideDeck({ story, deckRef }: { story: StoryUnit; deckRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div
      ref={deckRef}
      style={{
        position: 'fixed',
        left: -99999,
        top: 0,
        width: SLIDE_W,
        pointerEvents: 'none',
      }}
    >
      <div data-slide><MoodSlide story={story} /></div>
      <div data-slide><HookSlide story={story} /></div>
      {story.beats.map((b, i) => (
        <div data-slide key={i}>
          <BeatSlide beat={b} index={i} story={story} />
        </div>
      ))}
      <div data-slide><ActionSlide story={story} /></div>
      <div data-slide><ClosingSlide story={story} /></div>
    </div>
  )
}

export const SLIDE_DIMENSIONS = { width: SLIDE_W, height: SLIDE_H }
