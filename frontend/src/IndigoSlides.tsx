/**
 * 22-slide Hotel Indigo design-system renderer.
 * Each slide is a 960×540 div. Wrapped in [data-indigo-slide] for capture.
 *
 * Rendered off-screen at full size; FastLane scales them for preview.
 */
import { useEffect, useRef, useState } from 'react'
import type { IndigoStoryUnit, IndigoBeat } from './indigo_types'

// ── Design tokens ────────────────────────────────────────────────────────
const T = {
  teal:   '#2D7A7A',
  tealLt: '#3A9A9A',
  gold:   '#C8A96E',
  navy:   '#1A2E3B',
  grayD:  '#374151',
  grayM:  '#6B7280',
  grayL:  '#D1D5DB',
  white:  '#FFFFFF',
  bg:     '#0f0f0f',
}
const W = 960, H = 540

// ── Beat background gradients ─────────────────────────────────────────────
const BEAT_BG: Record<string, string> = {
  '01': 'radial-gradient(ellipse at 75% 40%,rgba(200,150,80,.35) 0%,transparent 55%),radial-gradient(ellipse at 20% 80%,rgba(45,122,122,.2) 0%,transparent 45%),linear-gradient(155deg,#1e1408 0%,#2e2010 45%,#1a1808 100%)',
  '02': 'radial-gradient(ellipse at 60% 50%,rgba(80,120,120,.3) 0%,transparent 60%),linear-gradient(160deg,#0e1818 0%,#1a2828 50%,#0a1010 100%)',
  '03': 'radial-gradient(ellipse at 30% 40%,rgba(180,120,60,.3) 0%,transparent 55%),radial-gradient(ellipse at 80% 70%,rgba(100,80,40,.2) 0%,transparent 45%),linear-gradient(150deg,#1e160a 0%,#2a1e0e 50%,#120e06 100%)',
  '04': 'radial-gradient(ellipse at 70% 40%,rgba(160,60,40,.3) 0%,transparent 55%),radial-gradient(ellipse at 20% 70%,rgba(200,169,110,.2) 0%,transparent 45%),linear-gradient(150deg,#1a0e0a 0%,#261410 50%,#100a08 100%)',
  '05': 'radial-gradient(ellipse at 65% 45%,rgba(60,100,140,.3) 0%,transparent 55%),linear-gradient(160deg,#0e1218 0%,#161e28 50%,#0a0e14 100%)',
  '06': 'radial-gradient(ellipse at 50% 30%,rgba(200,220,210,.18) 0%,transparent 60%),radial-gradient(ellipse at 30% 70%,rgba(45,122,122,.25) 0%,transparent 50%),linear-gradient(170deg,#0e1a18 0%,#1a2a28 50%,#0a1412 100%)',
}
const ORIGIN_BG = [
  'linear-gradient(170deg,#2a3e3e 0%,#3a5050 35%,#283c3c 65%,#1a2c2c 100%)',
  'linear-gradient(170deg,#3a3020 0%,#504030 35%,#383020 65%,#282010 100%)',
  'linear-gradient(170deg,#283a28 0%,#384a38 35%,#283828 65%,#1a2c1a 100%)',
]
type BeatImageField = 'image_url' | 'mood_image_url' | 'col2_image_url' | 'col3_image_url'
const DEFAULT_IMAGE_FIELDS: BeatImageField[] = ['image_url', 'mood_image_url', 'col2_image_url', 'col3_image_url']
function beatImage(s: IndigoStoryUnit, idx: number, fields: BeatImageField[] = DEFAULT_IMAGE_FIELDS) {
  if (!s.beats.length) return undefined
  const beat = s.beats[idx % s.beats.length]
  return fields.map((field) => beat[field]).find(Boolean)
}
const MB_COL1_BG: Record<string, string> = {
  '01': 'linear-gradient(135deg,#2a1e0e 0%,#1a1208 100%)',
  '02': 'linear-gradient(135deg,#1a2828 0%,#2a3838 100%)',
  '03': 'linear-gradient(135deg,#e4ddd4 0%,#d4c8b8 100%)',
  '04': 'linear-gradient(135deg,#3a2e20 0%,#2a2018 100%)',
  '05': 'linear-gradient(135deg,#161e28 0%,#222e3e 100%)',
  '06': 'linear-gradient(135deg,#1a2a28 0%,#2a3a38 100%)',
}

// ── Shared sub-components ─────────────────────────────────────────────────
function HBar({ city, district }: { city: string; district: string }) {
  const cell: React.CSSProperties = {
    flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
    padding: '0 12px', borderRight: '1px solid rgba(26,46,59,.25)',
    fontSize: 7, letterSpacing: '0.12em', lineHeight: 1.5,
    color: T.navy, fontWeight: 300,
  }
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, height: 36,
      background: 'rgba(255,255,255,.92)', display: 'flex',
      borderBottom: `2px solid ${T.teal}`,
    }}>
      <div style={{ ...cell, borderLeft: '1px solid rgba(26,46,59,.25)' }}>
        <span style={{ fontWeight: 700, fontSize: 8, letterSpacing: '0.08em' }}>HOTEL</span>
        <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.12em' }}>INDIGO</span>
      </div>
      <div style={cell}>
        HOTEL INDIGO {city.toUpperCase()} {district.toUpperCase()}<br />
        STORYLINE STRATEGIC DEVELOPMENT
      </div>
      <div style={cell}>
        英迪格酒店 · {city}{district}<br />2026
      </div>
      <div style={{ ...cell, borderRight: '1px solid rgba(26,46,59,.25)' }}>
        VOCUIS BRANDING &amp; DESIGN
      </div>
    </div>
  )
}

function SecLabel({ en, zh }: { en: string; zh: string }) {
  return (
    <div style={{ position: 'absolute', top: 42, left: 22 }}>
      <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: T.teal }}>{en}</div>
      <div style={{ fontSize: 6, color: T.grayM, marginTop: 2 }}>{zh}</div>
    </div>
  )
}

function PageNum({ n, dark }: { n: number; dark?: boolean }) {
  return (
    <div style={{
      position: 'absolute', bottom: 12, right: 18,
      fontSize: 12, fontWeight: 300,
      color: dark ? T.grayM : 'rgba(255,255,255,.45)',
    }}>{n}</div>
  )
}

// ── Slide types ───────────────────────────────────────────────────────────

function Slide01Cover({ s }: { s: IndigoStoryUnit }) {
  const coverImage = beatImage(s, 0, ['image_url', 'mood_image_url', 'col2_image_url', 'col3_image_url'])
  return (
    <div style={{ width: W, height: H, background: '#0c1820', position: 'relative', overflow: 'hidden', fontFamily: "'Helvetica Neue',Arial,'PingFang SC','Microsoft YaHei',sans-serif" }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 30% 50%,rgba(45,122,122,.18) 0%,transparent 55%),linear-gradient(160deg,#0c1820 0%,#162430 50%,#0a1218 100%)' }} />
      {coverImage && (
        <>
          <img src={coverImage} alt="" style={{ position: 'absolute', top: 36, right: 0, bottom: 0, width: '48%', height: 'calc(100% - 36px)', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', top: 36, bottom: 0, left: '50%', width: 8, background: '#0c1820' }} />
        </>
      )}
      <HBar city={s.city} district={s.district} />
      <div style={{ position: 'absolute', bottom: 100, left: 44 }}>
        <div style={{ fontSize: 6, fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,.35)', marginBottom: 8 }}>HOTEL</div>
        <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.white, lineHeight: 1 }}>INDIGO</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', marginTop: 10, letterSpacing: '0.05em' }}>
          Hotel Indigo {s.hotel_en} · Touchpoints Development
        </div>
        <div style={{ fontSize: 8, color: T.tealLt, marginTop: 8, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          Phase 01 · Proposal · 2026
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 14, left: 44, right: 44, fontSize: 6, color: 'rgba(255,255,255,.2)', lineHeight: 1.6 }}>
        所有参考图片、参考文献、引用文字等资料仅供此专案相关人员内部研究及沟通过程引用，任何一方不得将以上资料转为其他商业用途。
      </div>
      <PageNum n={1} />
    </div>
  )
}

function Slide02Taglines({ s }: { s: IndigoStoryUnit }) {
  return (
    <div style={{ width: W, height: H, background: T.white, position: 'relative', overflow: 'hidden', fontFamily: "'Helvetica Neue',Arial,'PingFang SC','Microsoft YaHei',sans-serif" }}>
      <HBar city={s.city} district={s.district} />
      <SecLabel en="TAGLINE OPTION" zh="故事标题方案" />
      <div style={{ position: 'absolute', top: 70, left: 22, right: 22, bottom: 28, display: 'flex', gap: 12, alignItems: 'stretch' }}>
        {s.taglines.map((tl, i) => {
          const image = beatImage(s, i, ['mood_image_url', 'image_url', 'col2_image_url', 'col3_image_url'])
          return (
            <div key={i} style={{ flex: 1, border: `1px solid ${i === 0 ? T.teal : T.grayL}`, borderRadius: 2, padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 6, background: i === 0 ? 'rgba(45,122,122,.04)' : '#fff' }}>
              <div style={{ fontSize: 7, color: T.grayM, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'monospace' }}>Option {i + 1}{i === 0 ? ' ★' : ''}</div>
              <div style={{ fontSize: 22, fontWeight: 400, letterSpacing: '0.5em', color: T.navy, fontFamily: "'STSong','SimSun','Noto Serif CJK SC',serif", lineHeight: 1.3 }}>{tl.zh}</div>
              <div style={{ fontSize: 9, color: T.grayM, lineHeight: 1.6 }}>{tl.sub}</div>
              {image ? (
                <img src={image} alt="" style={{ marginTop: 'auto', height: 150, width: '100%', borderRadius: 1, objectFit: 'cover' }} />
              ) : (
                <div style={{ marginTop: 'auto', height: 150, borderRadius: 1, background: '#ecf0f0' }} />
              )}
            </div>
          )
        })}
      </div>
      <PageNum n={2} dark />
    </div>
  )
}

function SlideCinematic({ n, bg, headline, paras, topLabel, imageUrl }: {
  n: number; bg: string; headline: string; paras: string[]; topLabel?: string; imageUrl?: string
}) {
  return (
    <div style={{ width: W, height: H, background: bg, position: 'relative', overflow: 'hidden', fontFamily: "'Helvetica Neue',Arial,'PingFang SC','Microsoft YaHei',sans-serif" }}>
      {imageUrl && (
        <>
          <img src={imageUrl} alt="" style={{ position: 'absolute', top: 36, right: 0, bottom: 0, width: '28%', height: 'calc(100% - 36px)', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', top: 36, bottom: 0, right: '28%', width: 8, background: bg }} />
        </>
      )}
      {topLabel && (
        <div style={{ position: 'absolute', top: 16, left: 20, zIndex: 4 }}>
          <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,.35)' }}>STORYLINE CONCEPT</div>
          <div style={{ fontSize: 6, color: 'rgba(255,255,255,.2)', marginTop: 2 }}>故事概念方向</div>
        </div>
      )}
      <div style={{ position: 'absolute', inset: 0, right: imageUrl ? '28%' : 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 70px', textAlign: 'center', gap: 18 }}>
        <div style={{ fontSize: 20, fontWeight: 300, letterSpacing: '0.08em', color: T.white, lineHeight: 1.4, fontFamily: "'STSong','SimSun','Noto Serif CJK SC',serif" }}
          dangerouslySetInnerHTML={{ __html: headline.replace(/「([^」]+)」/g, '<em style="font-style:italic;color:#C8A96E">「$1」</em>') }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {paras.map((p, i) => (
            <p key={i} style={{ fontSize: 8.5, color: 'rgba(255,255,255,.65)', lineHeight: 1.95, margin: 0 }}>{p}</p>
          ))}
        </div>
      </div>
      <PageNum n={n} />
    </div>
  )
}

function SlideOrigin({ n, s, idx }: { n: number; s: IndigoStoryUnit; idx: number }) {
  const o = s.origins[idx]
  const isTwo = idx === 1  // origin 2 has a 2-col layout with map
  const beatImg = beatImage(s, idx, ['image_url', 'mood_image_url', 'col2_image_url', 'col3_image_url'])
  return (
    <div style={{ width: W, height: H, background: T.white, position: 'relative', overflow: 'hidden', fontFamily: "'Helvetica Neue',Arial,'PingFang SC','Microsoft YaHei',sans-serif" }}>
      <HBar city={s.city} district={s.district} />
      <SecLabel en="STORYLINE CONCEPT" zh="故事概念方向" />
      {/* Photo left */}
      {beatImg ? (
        <img src={beatImg} alt="" style={{ position: 'absolute', top: 58, left: 0, width: 320, bottom: 0, height: 'calc(100% - 58px)', objectFit: 'cover' }} />
      ) : (
        <div style={{ position: 'absolute', top: 58, left: 0, width: 320, bottom: 0, background: ORIGIN_BG[idx], display: 'flex', alignItems: 'flex-end', padding: '10px 14px' }}>
          <span style={{ fontSize: 6, color: 'rgba(255,255,255,.25)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Photo placeholder · {o.title}</span>
        </div>
      )}
      {/* Body right */}
      <div style={{ position: 'absolute', top: 58, left: 330, right: 0, bottom: 0, padding: '18px 22px 18px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 6, color: T.teal, letterSpacing: '0.15em', textTransform: 'uppercase' }}>○ ORIGIN · {o.title}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.navy, lineHeight: 1.4 }}>{o.headline}</div>
        {isTwo ? (
          <div style={{ display: 'flex', gap: 14 }}>
            <div style={{ flex: 1, fontSize: 8, color: T.grayD, lineHeight: 1.85 }}>{o.body}</div>
            <div style={{ width: 110, background: T.grayL, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, color: T.grayM, flexShrink: 0 }}>MAP<br />{s.district}区域图</div>
          </div>
        ) : (
          <div style={{ fontSize: 8, color: T.grayD, lineHeight: 1.85 }}>{o.body}</div>
        )}
      </div>
      <PageNum n={n} dark />
    </div>
  )
}

function SlideStorySummary({ n, s }: { n: number; s: IndigoStoryUnit }) {
  const image = beatImage(s, 4, ['mood_image_url', 'image_url', 'col2_image_url', 'col3_image_url'])
  return (
    <div style={{ width: W, height: H, background: 'linear-gradient(160deg,#12180a 0%,#1e2810 50%,#0e1408 100%)', position: 'relative', overflow: 'hidden', fontFamily: "'Helvetica Neue',Arial,'PingFang SC','Microsoft YaHei',sans-serif" }}>
      {image && (
        <>
          <img src={image} alt="" style={{ position: 'absolute', top: 32, right: 0, bottom: 0, width: '30%', height: 'calc(100% - 32px)', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', top: 32, bottom: 0, right: '30%', width: 8, background: '#12180a' }} />
        </>
      )}
      <div style={{ position: 'absolute', top: 16, left: 20 }}>
        <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,.35)' }}>STORY SUMMARY</div>
        <div style={{ fontSize: 6, color: 'rgba(255,255,255,.2)', marginTop: 2 }}>故事总结</div>
      </div>
      <div style={{ position: 'absolute', inset: 0, right: image ? '30%' : 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 78px', gap: 24 }}>
        <div style={{ fontSize: 7, color: T.tealLt, letterSpacing: '0.25em', textTransform: 'uppercase' }}>Hotel Indigo {s.hotel_en}</div>
        <div style={{ fontSize: 14, color: T.white, lineHeight: 2, textAlign: 'center', fontWeight: 300 }}>{s.story_summary}</div>
        <div style={{ width: 40, height: 1, background: T.gold, opacity: 0.6 }} />
        <div style={{ fontSize: 8, color: 'rgba(255,255,255,.4)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>{s.city.toUpperCase()} · {s.district.toUpperCase()}</div>
      </div>
      <PageNum n={n} />
    </div>
  )
}

function SlideStoryMapping({ n, s }: { n: number; s: IndigoStoryUnit }) {
  const colors = ['#2a1e0e','#0e1818','#1e160a','#1a0e0a','#0e1218','#0e1a18']
  return (
    <div style={{ width: W, height: H, background: T.white, position: 'relative', overflow: 'hidden', fontFamily: "'Helvetica Neue',Arial,'PingFang SC','Microsoft YaHei',sans-serif" }}>
      <div style={{ position: 'absolute', top: 40, left: 28, right: 28, display: 'flex', alignItems: 'baseline', gap: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '0.04em', color: T.navy, textTransform: 'uppercase' }}>STORY MAPPING</div>
        <div style={{ fontSize: 10, color: T.grayM, fontWeight: 300, letterSpacing: '0.05em' }}>空间触点索引</div>
      </div>
      <div style={{ position: 'absolute', top: 90, left: 28, right: 28, height: 350, display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 5 }}>
        {s.beats.map((b, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, borderRadius: 1, position: 'relative', minHeight: 0, overflow: 'hidden', background: colors[i] }}>
              {(b.image_url || b.mood_image_url || b.col2_image_url || b.col3_image_url) && <img src={b.image_url || b.mood_image_url || b.col2_image_url || b.col3_image_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
              <div style={{ position: 'absolute', top: 7, left: 7, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.7)', zIndex: 1, textShadow: '0 1px 3px rgba(0,0,0,.5)' }}>{b.num}</div>
            </div>
            <div style={{ fontSize: 7, fontWeight: 600, color: T.navy, textAlign: 'center', marginTop: 5, lineHeight: 1.4 }}>{b.name_zh}</div>
            <div style={{ fontSize: 5.5, color: T.grayM, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2, lineHeight: 1.4 }}>{b.space_zh}</div>
          </div>
        ))}
      </div>
      <PageNum n={n} dark />
    </div>
  )
}

function SlideStoryFlowGrid({ n, s }: { n: number; s: IndigoStoryUnit }) {
  return (
    <div style={{ width: W, height: H, background: T.white, position: 'relative', overflow: 'hidden', fontFamily: "'Helvetica Neue',Arial,'PingFang SC','Microsoft YaHei',sans-serif" }}>
      <div style={{ position: 'absolute', top: 22, left: 28, fontSize: 6, fontWeight: 700, color: T.teal, letterSpacing: '0.18em' }}>STORY TOUCHPOINTS</div>
      <div style={{ position: 'absolute', top: 38, left: 28, fontSize: 18, fontWeight: 300, color: T.navy, letterSpacing: '0.06em' }}>空间触点</div>
      <div style={{ position: 'absolute', top: 27, right: 28, width: 280, fontSize: 7, color: T.grayM, lineHeight: 1.55, textAlign: 'right' }}>{s.story_summary}</div>
      <div style={{ position: 'absolute', top: 78, left: 28, right: 28, bottom: 22, display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gridTemplateRows: 'repeat(2,minmax(0,1fr))', columnGap: 14, rowGap: 18 }}>
        {s.beats.map((b, i) => {
          const image = beatImage(s, i, ['image_url', 'mood_image_url', 'col2_image_url', 'col3_image_url'])
          return (
          <div key={i} style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            {image ? (
              <img src={image} alt="" style={{ width: '100%', height: 58, objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: 58, background: '#ecf0f0' }} />
            )}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6, minWidth: 0 }}>
              <div style={{ flex: '0 0 auto', fontSize: 6, fontWeight: 700, color: T.teal, letterSpacing: '0.12em' }}>{b.num}</div>
              <div style={{ minWidth: 0, fontSize: 9, fontWeight: 700, color: T.navy, lineHeight: 1.25 }}>{b.name_zh}</div>
            </div>
            <div style={{ fontSize: 5.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.grayM, marginTop: 3 }}>{b.space_zh}</div>
            <div style={{ fontSize: 6.2, color: T.grayD, lineHeight: 1.55, marginTop: 5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{b.narrative}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 'auto', paddingTop: 5 }}>
              <div style={{ width: 16, height: 1, background: T.gold, flex: '0 0 auto' }} />
              <div style={{ minWidth: 0, fontSize: 5.8, color: T.teal, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.tagline}</div>
            </div>
          </div>
          )
        })}
      </div>
      <PageNum n={n} dark />
    </div>
  )
}

function SlideBeatCover({ n, beat }: { n: number; beat: IndigoBeat }) {
  const ghostLines = beat.ghost_en.split('\n')
  return (
    <div style={{ width: W, height: H, background: BEAT_BG[beat.num], position: 'relative', overflow: 'hidden', color: T.white, fontFamily: "'Helvetica Neue',Arial,'PingFang SC','Microsoft YaHei',sans-serif" }}>
      {/* Left text panel */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '44%', padding: '50px 36px 38px 42px', display: 'flex', flexDirection: 'column', justifyContent: 'center', zIndex: 3 }}>
        <div style={{ fontSize: 26, fontWeight: 400, letterSpacing: '0.55em', color: T.white, lineHeight: 1.3, fontFamily: "'STSong','SimSun','Noto Serif CJK SC',serif", marginBottom: 5, whiteSpace: 'nowrap' }}>
          {beat.name_zh}
        </div>
        <div style={{ fontSize: 8, color: 'rgba(255,255,255,.45)', letterSpacing: '0.07em', marginBottom: 18 }}>{beat.space_zh}</div>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: T.gold, opacity: 0.2, lineHeight: 1.1, marginBottom: 20, userSelect: 'none' }}>
          {ghostLines.map((l, i) => <span key={i}>{l}{i < ghostLines.length - 1 && <br />}</span>)}
        </div>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,.68)', lineHeight: 1.95, marginBottom: 20 }}>{beat.narrative}</div>
        <div style={{ fontSize: 7.5, color: T.tealLt, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 7 }}>在这里 · ZAI ZHE LI</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.white, lineHeight: 1.6, letterSpacing: '0.02em' }}>{beat.tagline}</div>
      </div>
      {/* Right image */}
      {beat.image_url ? (
        <img src={beat.image_url} alt="" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, left: '44%', width: '56%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, left: '44%', background: 'rgba(0,0,0,.15)' }} />
      )}
      <PageNum n={n} />
    </div>
  )
}

function SlideMoodboard({ n, beat, s }: { n: number; beat: IndigoBeat; s: IndigoStoryUnit }) {
  const mbGhostLines = beat.mb_ghost_en.split('\n')
  const col1Bg = MB_COL1_BG[beat.num] || 'linear-gradient(135deg,#dde4e4,#c8d4d4)'
  const isWarm = ['01','03','04'].includes(beat.num)
  const phBg = isWarm ? 'linear-gradient(135deg,#e4ddd4,#d4c8b8)' : 'linear-gradient(135deg,#dde4e4,#c8d4d4)'
  return (
    <div style={{ width: W, height: H, background: T.white, position: 'relative', overflow: 'hidden', fontFamily: "'Helvetica Neue',Arial,'PingFang SC','Microsoft YaHei',sans-serif" }}>
      <HBar city={s.city} district={s.district} />
      <SecLabel en="STORYLINE CONCEPT" zh="故事概念方向" />
      <div style={{ position: 'absolute', top: 60, left: 0, right: 0, bottom: 0, display: 'grid', gridTemplateColumns: '28% 36% 36%' }}>
        {/* Col 1: concept */}
        <div style={{ padding: '16px 18px', borderRight: '1px solid #f0f0ee', overflow: 'hidden' }}>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#e8ecec', lineHeight: 1, marginBottom: 6 }}>
            {mbGhostLines.map((l, i) => <span key={i}>{l}{i < mbGhostLines.length - 1 && <br />}</span>)}
          </div>
          <div style={{ fontSize: 6, fontWeight: 700, color: T.navy, letterSpacing: '0.07em', marginBottom: 2 }}>{beat.space_zh}</div>
          <div style={{ fontSize: 6, color: T.teal, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>运用元素</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.navy, lineHeight: 1.3, marginBottom: 3 }}>{beat.mb_concept}</div>
          <div style={{ fontSize: 7, color: T.grayM, marginBottom: 8 }}>{beat.mb_concept_sub}</div>
          {beat.mood_image_url ? (
            <img src={beat.mood_image_url} alt="" style={{ height: 108, width: '100%', borderRadius: 1, objectFit: 'cover', marginTop: 6 }} />
          ) : (
            <div style={{ height: 108, borderRadius: 1, background: col1Bg, marginTop: 6 }} />
          )}
        </div>
        {/* Col 2 */}
        <div style={{ padding: '16px 18px', borderRight: '1px solid #f0f0ee', overflow: 'hidden' }}>
          <div style={{ fontSize: 8, fontWeight: 700, color: T.navy, marginBottom: 3, letterSpacing: '0.04em' }}>{beat.mb_col2_title}</div>
          <div style={{ fontSize: 8, fontWeight: 700, color: T.teal, marginBottom: 5, letterSpacing: '0.02em' }}>{beat.mb_col2_accent}</div>
          <div style={{ fontSize: 7, color: T.grayD, lineHeight: 1.85, marginBottom: 7 }}>{beat.mb_col2_body}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {(beat.col2_image_url || beat.image_url) ? (
              <>
                <img src={beat.col2_image_url || beat.image_url} alt="" style={{ height: 66, width: '100%', borderRadius: 1, objectFit: 'cover' }} />
                <img src={beat.col2_image_url || beat.image_url} alt="" style={{ height: 66, width: '100%', borderRadius: 1, objectFit: 'cover', objectPosition: 'right' }} />
                <img src={beat.col2_image_url || beat.image_url} alt="" style={{ height: 46, width: '100%', borderRadius: 1, objectFit: 'cover', objectPosition: 'center top', gridColumn: '1/-1' }} />
              </>
            ) : (
              <>
                <div style={{ height: 66, borderRadius: 1, background: phBg }} />
                <div style={{ height: 66, borderRadius: 1, background: phBg }} />
                <div style={{ height: 46, borderRadius: 1, background: phBg, gridColumn: '1/-1' }} />
              </>
            )}
          </div>
        </div>
        {/* Col 3 */}
        <div style={{ padding: '16px 18px', overflow: 'hidden' }}>
          <div style={{ fontSize: 8, fontWeight: 700, color: T.navy, marginBottom: 3, letterSpacing: '0.04em' }}>{beat.mb_col3_title}</div>
          <div style={{ fontSize: 8, fontWeight: 700, color: T.teal, marginBottom: 5, letterSpacing: '0.02em' }}>{beat.mb_col3_accent}</div>
          <div style={{ fontSize: 7, color: T.grayD, lineHeight: 1.85, marginBottom: 7 }}>{beat.mb_col3_body}</div>
          {(beat.col3_image_url || beat.mood_image_url) ? (
            <img src={beat.col3_image_url || beat.mood_image_url} alt="" style={{ height: 98, width: '100%', borderRadius: 1, objectFit: 'cover', marginBottom: 4 }} />
          ) : (
            <div style={{ height: 98, borderRadius: 1, background: phBg, marginBottom: 4 }} />
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {(beat.col3_image_url || beat.mood_image_url) ? (
              <>
                <img src={beat.col3_image_url || beat.mood_image_url} alt="" style={{ height: 48, width: '100%', borderRadius: 1, objectFit: 'cover', objectPosition: 'left' }} />
                <img src={beat.col3_image_url || beat.mood_image_url} alt="" style={{ height: 48, width: '100%', borderRadius: 1, objectFit: 'cover', objectPosition: 'right' }} />
              </>
            ) : (
              <>
                <div style={{ height: 48, borderRadius: 1, background: phBg }} />
                <div style={{ height: 48, borderRadius: 1, background: phBg }} />
              </>
            )}
          </div>
        </div>
      </div>
      <PageNum n={n} dark />
    </div>
  )
}

// ── Slide node list ───────────────────────────────────────────────────────
export function buildSlideNodes(story: IndigoStoryUnit): React.ReactNode[] {
  return [
    <Slide01Cover s={story} />,
    <Slide02Taglines s={story} />,
    <SlideCinematic
      n={3}
      bg="linear-gradient(160deg,#101c10 0%,#182818 50%,#0c1408 100%)"
      headline={story.taglines[0].zh + '\n' + story.taglines[0].sub}
      paras={story.concept_poem}
      topLabel="STORYLINE CONCEPT"
      imageUrl={beatImage(story, 1, ['mood_image_url', 'image_url', 'col2_image_url', 'col3_image_url'])}
    />,
    <SlideOrigin n={4} s={story} idx={0} />,
    <SlideOrigin n={5} s={story} idx={1} />,
    <SlideOrigin n={6} s={story} idx={2} />,
    <SlideCinematic
      n={7}
      bg="linear-gradient(160deg,#0e1610 0%,#1a2a18 50%,#0a1008 100%)"
      headline={story.emotion_headline}
      paras={story.emotion_poem}
      topLabel="STORY EMOTION"
      imageUrl={beatImage(story, 3, ['mood_image_url', 'image_url', 'col2_image_url', 'col3_image_url'])}
    />,
    <SlideStorySummary n={8} s={story} />,
    <SlideStoryMapping n={9} s={story} />,
    <SlideStoryFlowGrid n={10} s={story} />,
    ...story.beats.flatMap((b, i) => [
      <SlideBeatCover n={11 + i * 2} beat={b} />,
      <SlideMoodboard n={12 + i * 2} beat={b} s={story} />,
    ]),
  ]
}

// ── Off-screen capture target ─────────────────────────────────────────────
export function IndigoSlides({
  story,
  containerRef,
}: {
  story: IndigoStoryUnit
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  const slides = buildSlideNodes(story)
  return (
    <div ref={containerRef} style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none' }}>
      {slides.map((slide, i) => (
        <div key={i} data-indigo-slide>{slide}</div>
      ))}
    </div>
  )
}

// ── Visible scrollable preview ────────────────────────────────────────────
export function IndigoPreview({ story }: { story: IndigoStoryUnit }) {
  const slides = buildSlideNodes(story)
  const containerRef = useRef<HTMLDivElement>(null)
  const [previewWidth, setPreviewWidth] = useState(() =>
    Math.min(860, Math.max(window.innerWidth - 24, 240)),
  )
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const updateWidth = () => setPreviewWidth(Math.min(container.clientWidth, 860))
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const scale = Math.min(previewWidth / W, 1)
  const scaledH = H * scale
  return (
    <div style={{ padding: '32px clamp(12px, 4vw, 24px)' }}>
      <div ref={containerRef} style={{ display: 'flex', width: '100%', maxWidth: 860, margin: '0 auto', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        {slides.map((slide, i) => (
          <div key={i} style={{ width: W * scale, height: scaledH, overflow: 'hidden', flexShrink: 0, borderRadius: 2, boxShadow: '0 4px 24px rgba(0,0,0,.5)' }}>
            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: W, height: H }}>
              {slide}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export const INDIGO_SLIDE_DIMENSIONS = { width: W, height: H }
