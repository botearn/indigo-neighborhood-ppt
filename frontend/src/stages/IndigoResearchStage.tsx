import { useEffect, useMemo, useRef, useState } from 'react'
import type { GeoResult } from '../MapPicker'
import type {
  IndigoAtlasImageReference,
  IndigoAtlasPlace as IndigoAtlasPlaceModel,
  IndigoResearchBrief,
  IndigoResearchFinding,
  IndigoResearchSource,
  IndigoResearchSourceRecord,
} from '../indigo_types'

const TILE_SIZE = 256
const MIN_ZOOM = 2
const MAX_ZOOM = 18
const CARTO_SUBDOMAINS = ['a', 'b', 'c']

type Props = {
  candidate: GeoResult
  research: IndigoResearchBrief | null
  loading: boolean
  onStartWriting: () => void
  onResearchAction: (instruction: string) => void
  onBack: () => void
}

type AtlasPlace = {
  id: string
  zone: string
  zoneIndex: number
  index: number
  longitude: number
  latitude: number
  hasRealCoordinates: boolean
  coordinateStatus: string
  title: string
  placeType: string
  summary: string
  historicalNote: string
  culturalNote: string
  designRelevance: string
  sourceStatus: string
  linkedFindings: string[]
  evidenceMediums: string[]
  openQuestions: string[]
  sources: IndigoResearchSource[]
  imageReferences: IndigoAtlasImageReference[]
  records: IndigoResearchSourceRecord[]
}

type ZoneSummary = {
  name: string
  count: number
  backed: number
}

type Point = { x: number; y: number }
type Size = { width: number; height: number }

const MEDIUMS = [
  { key: 'gazetteer', label: '地方志/书籍', needles: ['地方志', '书籍', 'book', 'gazetteer'] },
  { key: 'map', label: '老地图/规划图', needles: ['地图', 'map', '规划图'] },
  { key: 'photo_archive', label: '照片/影像档案', needles: ['照片', '影像', '图像', 'photo', 'archive'] },
  { key: 'newspaper', label: '报纸/地方媒体', needles: ['报纸', '媒体', 'newspaper'] },
  { key: 'oral_history', label: '口述史/居民声音', needles: ['口述', '居民', 'oral'] },
  { key: 'fieldwork', label: '实地观察', needles: ['实地', 'field'] },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeLng(lng: number) {
  return ((((lng + 180) % 360) + 360) % 360) - 180
}

function lngLatToWorld(longitude: number, latitude: number, zoom: number): Point {
  const scale = TILE_SIZE * 2 ** zoom
  const lat = clamp(latitude, -85.05112878, 85.05112878)
  const sin = Math.sin((lat * Math.PI) / 180)
  return {
    x: ((normalizeLng(longitude) + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  }
}

function worldToLngLat(x: number, y: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom
  const longitude = normalizeLng((x / scale) * 360 - 180)
  const n = Math.PI - (2 * Math.PI * y) / scale
  const latitude = (Math.atan(Math.sinh(n)) * 180) / Math.PI
  return { longitude, latitude: clamp(latitude, -85.05112878, 85.05112878) }
}

function tileUrl(z: number, x: number, y: number) {
  const subdomain = CARTO_SUBDOMAINS[Math.abs(x + y) % CARTO_SUBDOMAINS.length]
  return `https://${subdomain}.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`
}

function useElementSize(ref: React.RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => setSize({ width: el.clientWidth, height: el.clientHeight })
    read()
    const observer = new ResizeObserver(read)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  return size
}

function statusLabel(status: string) {
  if (status === 'verified') return '已核'
  if (status === 'client_provided') return '客户提供'
  return '待核'
}

function statusClass(status: string) {
  if (status === 'verified') return 'border-[#2d7a7a]/60 text-[#2d7a7a]'
  if (status === 'client_provided') return 'border-[#c8a96e]/60 text-[#c8a96e]'
  return 'border-[#6b7280]/50 text-[#6b7280]'
}

function sourceStatusLabel(status: string) {
  if (status === 'verified') return '已核'
  if (status === 'client_provided') return '客户'
  if (status === 'reviewing') return '核查中'
  if (status === 'blocked') return '受阻'
  return '待查'
}

function isSourceBacked(finding: IndigoResearchFinding) {
  return finding.source_status !== 'needs_verification' && finding.sources.length > 0
}

function isSourceBackedPlace(place: AtlasPlace) {
  return place.sourceStatus !== 'needs_verification' && place.sources.length > 0
}

function readiness(research: IndigoResearchBrief | null) {
  if (!research) {
    return { ready: false, unsupportedCount: 0, hasCultureReference: false, backedCount: 0 }
  }
  const backedCount = research.findings.filter(isSourceBacked).length
  const unsupportedCount = research.findings.length - backedCount
  const hasCultureReference = research.findings.some(
    finding => finding.category.includes('在地文化') && isSourceBacked(finding),
  )
  return {
    ready: true,
    unsupportedCount,
    hasCultureReference,
    backedCount,
  }
}

function groupedFindings(findings: IndigoResearchFinding[]) {
  return findings.reduce<Record<string, IndigoResearchFinding[]>>((acc, finding) => {
    const key = finding.category || '未分类'
    acc[key] = [...(acc[key] ?? []), finding]
    return acc
  }, {})
}

function linkedResearchFindings(research: IndigoResearchBrief, titles: string[]) {
  if (titles.length === 0) return []
  const wanted = new Set(titles)
  return research.findings.filter(finding => wanted.has(finding.title))
}

function sourceLibrary(research: IndigoResearchBrief | null): IndigoResearchSourceRecord[] {
  if (!research) return []
  if ((research.source_library ?? []).length > 0) return research.source_library ?? []

  return research.findings.flatMap(finding =>
    finding.sources.map(source => ({
      title: source.title,
      source_type: source.medium || 'source',
      institution: source.publisher,
      access_path: source.url,
      locator: source.locator ?? '',
      status: finding.source_status === 'client_provided' ? 'client_provided' : 'verified',
      relevance: source.usage_note || finding.claim,
      linked_findings: [finding.title],
      notes: source.collection ?? '',
    })),
  )
}

function linkedRecords(titles: string[], records: IndigoResearchSourceRecord[]) {
  if (titles.length === 0) return []
  const wanted = new Set(titles)
  return records.filter(record => (record.linked_findings ?? []).some(title => wanted.has(title)))
}

function fallbackCoordinates(candidate: GeoResult, index: number, total: number, zoneIndex: number, localIndex: number) {
  const angle = (index / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2
  const zoneRadius = 0.0048 + zoneIndex * 0.0018
  const localNudge = (localIndex % 3) * 0.0008
  return {
    longitude: candidate.longitude + Math.cos(angle) * (zoneRadius + localNudge),
    latitude: candidate.latitude + Math.sin(angle) * (zoneRadius + localNudge) * 0.75,
  }
}

function atlasPlaceFromModel({
  candidate,
  model,
  index,
  total,
  zoneIndex,
  localIndex,
  records,
  research,
}: {
  candidate: GeoResult
  model: IndigoAtlasPlaceModel
  index: number
  total: number
  zoneIndex: number
  localIndex: number
  records: IndigoResearchSourceRecord[]
  research: IndigoResearchBrief
}): AtlasPlace {
  const hasRealCoordinates = typeof model.longitude === 'number' && typeof model.latitude === 'number'
  const fallback = fallbackCoordinates(candidate, index, total, zoneIndex, localIndex)
  const linkedTitles = model.linked_findings ?? []
  const linkedFindings = linkedResearchFindings(research, linkedTitles)
  const inheritedSources = linkedFindings.flatMap(finding => finding.sources)
  const sources = (model.sources ?? []).length > 0 ? model.sources ?? [] : inheritedSources

  return {
    id: model.id || `${model.zone}-${model.name}-${index}`,
    zone: model.zone || '未分区',
    zoneIndex,
    index: index + 1,
    longitude: hasRealCoordinates ? model.longitude as number : fallback.longitude,
    latitude: hasRealCoordinates ? model.latitude as number : fallback.latitude,
    hasRealCoordinates,
    coordinateStatus: model.coordinate_status ?? (hasRealCoordinates ? 'verified' : 'needs_geocoding'),
    title: model.name,
    placeType: model.place_type ?? 'cultural_signal',
    summary: model.summary,
    historicalNote: model.historical_note ?? '',
    culturalNote: model.cultural_note ?? '',
    designRelevance: model.design_translation,
    sourceStatus: model.source_status,
    linkedFindings: linkedTitles,
    evidenceMediums: model.evidence_mediums ?? linkedFindings.flatMap(finding => finding.evidence_mediums ?? []),
    openQuestions: model.open_questions ?? [],
    sources,
    imageReferences: model.image_references ?? [],
    records: linkedRecords(linkedTitles.length > 0 ? linkedTitles : [model.name], records),
  }
}

function atlasPlaces(candidate: GeoResult, research: IndigoResearchBrief | null, records: IndigoResearchSourceRecord[]): AtlasPlace[] {
  if (!research) return []
  const atlasModelPlaces = research.atlas?.places ?? []

  if (atlasModelPlaces.length > 0) {
    const zoneNames = Array.from(new Set(atlasModelPlaces.map(place => place.zone || '未分区')))
    const localCounts = new globalThis.Map<string, number>()

    return atlasModelPlaces.map((place, index) => {
      const zone = place.zone || '未分区'
      const localIndex = localCounts.get(zone) ?? 0
      localCounts.set(zone, localIndex + 1)
      return atlasPlaceFromModel({
        candidate,
        model: place,
        index,
        total: atlasModelPlaces.length,
        zoneIndex: Math.max(zoneNames.indexOf(zone), 0),
        localIndex,
        records,
        research,
      })
    })
  }

  const groups = groupedFindings(research.findings)
  const zones = Object.entries(groups)
  const total = research.findings.length || 1
  let globalIndex = 0

  return zones.flatMap(([zone, findings], zoneIndex) =>
    findings.map((finding, localIndex) => {
      const coordinates = fallbackCoordinates(candidate, globalIndex, total, zoneIndex, localIndex)
      const place: AtlasPlace = {
        id: `${zone}-${finding.title}-${localIndex}`,
        zone,
        zoneIndex,
        index: globalIndex + 1,
        longitude: coordinates.longitude,
        latitude: coordinates.latitude,
        hasRealCoordinates: false,
        coordinateStatus: 'interpretive',
        title: finding.title,
        placeType: 'finding',
        summary: finding.claim,
        historicalNote: finding.claim,
        culturalNote: finding.category.includes('在地文化') ? finding.claim : '',
        designRelevance: finding.design_relevance,
        sourceStatus: finding.source_status,
        linkedFindings: [finding.title],
        evidenceMediums: finding.evidence_mediums ?? [],
        openQuestions: finding.open_questions ?? [],
        sources: finding.sources,
        imageReferences: [],
        records: linkedRecords([finding.title], records),
      }
      globalIndex += 1
      return place
    }),
  )
}

function zoneSummaries(places: AtlasPlace[]): ZoneSummary[] {
  const byZone = places.reduce<Record<string, ZoneSummary>>((acc, place) => {
    const existing = acc[place.zone] ?? { name: place.zone, count: 0, backed: 0 }
    existing.count += 1
    if (isSourceBackedPlace(place)) existing.backed += 1
    acc[place.zone] = existing
    return acc
  }, {})
  return Object.values(byZone)
}

function AtlasRasterMap({
  candidate,
  places,
  selectedPlace,
  onSelect,
}: {
  candidate: GeoResult
  places: AtlasPlace[]
  selectedPlace: AtlasPlace | null
  onSelect: (id: string) => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{
    pointerId: number
    start: Point
    center: Point
    moved: boolean
    zoom: number
  } | null>(null)
  const [viewState, setViewState] = useState({
    longitude: candidate.longitude,
    latitude: candidate.latitude,
    zoom: 14,
  })
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const size = useElementSize(ref)
  const z = clamp(Math.round(viewState.zoom), MIN_ZOOM, MAX_ZOOM)
  const center = lngLatToWorld(viewState.longitude, viewState.latitude, z)
  const topLeft = { x: center.x - size.width / 2, y: center.y - size.height / 2 }

  useEffect(() => {
    setViewState({
      longitude: candidate.longitude,
      latitude: candidate.latitude,
      zoom: 14,
    })
  }, [candidate.latitude, candidate.longitude])

  const tiles = useMemo(() => {
    if (!size.width || !size.height) return []
    const worldTiles = 2 ** z
    const maxY = worldTiles - 1
    const startX = Math.floor(topLeft.x / TILE_SIZE) - 1
    const endX = Math.floor((topLeft.x + size.width) / TILE_SIZE) + 1
    const startY = clamp(Math.floor(topLeft.y / TILE_SIZE) - 1, 0, maxY)
    const endY = clamp(Math.floor((topLeft.y + size.height) / TILE_SIZE) + 1, 0, maxY)
    const nextTiles: {
      key: string
      url: string
      left: number
      top: number
    }[] = []

    for (let y = startY; y <= endY; y += 1) {
      for (let x = startX; x <= endX; x += 1) {
        const wrappedX = ((x % worldTiles) + worldTiles) % worldTiles
        nextTiles.push({
          key: `${z}-${x}-${y}`,
          url: tileUrl(z, wrappedX, y),
          left: x * TILE_SIZE - topLeft.x,
          top: y * TILE_SIZE - topLeft.y,
        })
      }
    }

    return nextTiles
  }, [size.height, size.width, topLeft.x, topLeft.y, z])

  const candidatePoint = lngLatToWorld(candidate.longitude, candidate.latitude, z)
  const hoveredPlace = hoveredId ? places.find(place => place.id === hoveredId) ?? null : null
  const hoveredPoint = hoveredPlace ? lngLatToWorld(hoveredPlace.longitude, hoveredPlace.latitude, z) : null

  function previewPosition(point: Point) {
    const markerX = point.x - topLeft.x
    const markerY = point.y - topLeft.y
    const width = 270
    const height = 172
    const padding = 14
    const preferRight = markerX + width + 34 <= size.width
    const preferBelow = markerY + height + 24 <= size.height
    return {
      left: clamp(preferRight ? markerX + 20 : markerX - width - 20, padding, Math.max(padding, size.width - width - padding)),
      top: clamp(preferBelow ? markerY - 18 : markerY - height + 18, padding, Math.max(padding, size.height - height - padding)),
      width,
    }
  }

  function setZoom(nextZoom: number) {
    setViewState(prev => ({
      ...prev,
      zoom: clamp(nextZoom, MIN_ZOOM, MAX_ZOOM),
    }))
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      center,
      moved: false,
      zoom: z,
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.start.x
    const dy = event.clientY - drag.start.y
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true
    const next = worldToLngLat(drag.center.x - dx, drag.center.y - dy, drag.zoom)
    setViewState({ ...next, zoom: drag.zoom })
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    dragRef.current = null
  }

  return (
    <div
      ref={ref}
      className="relative h-[420px] w-full cursor-grab select-none overflow-hidden bg-[#101312] active:cursor-grabbing"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        dragRef.current = null
      }}
    >
      {tiles.map(tile => (
        <img
          key={tile.key}
          src={tile.url}
          alt=""
          draggable={false}
          className="absolute max-w-none opacity-90"
          style={{ width: TILE_SIZE, height: TILE_SIZE, left: tile.left, top: tile.top }}
        />
      ))}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(16,16,15,0.38)_76%)]" />
      <div
        className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#f5f5f0] bg-[#c8a96e] shadow-[0_0_28px_rgba(200,169,110,0.6)]"
        style={{ left: candidatePoint.x - topLeft.x, top: candidatePoint.y - topLeft.y }}
      />
      {places.map(place => {
        const point = lngLatToWorld(place.longitude, place.latitude, z)
        return (
          <button
            key={place.id}
            onPointerDown={event => event.stopPropagation()}
            onPointerEnter={() => setHoveredId(place.id)}
            onPointerLeave={() => setHoveredId(current => current === place.id ? null : current)}
            onFocus={() => setHoveredId(place.id)}
            onBlur={() => setHoveredId(current => current === place.id ? null : current)}
            onClick={() => onSelect(place.id)}
            className={`absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full border text-[10px] transition ${
              selectedPlace?.id === place.id
                ? 'border-[#c8a96e] bg-[#c8a96e] text-[#0f0f0f]'
                : isSourceBackedPlace(place)
                  ? 'border-[#2d7a7a] bg-[#102524] text-[#2d7a7a]'
                  : 'border-[#6b7280] bg-[#141412] text-[#c8c8c0]'
            }`}
            style={{ left: point.x - topLeft.x, top: point.y - topLeft.y }}
          >
            {place.index}
          </button>
        )
      })}
      {hoveredPlace && hoveredPoint && (
        <div
          className="pointer-events-none absolute z-30 border border-[#2a2a28] bg-[#10100f]/95 px-3.5 py-3 shadow-[0_18px_48px_rgba(0,0,0,0.45)] backdrop-blur"
          style={previewPosition(hoveredPoint)}
        >
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#2d7a7a]">
                {String(hoveredPlace.index).padStart(2, '0')} · {hoveredPlace.zone}
              </div>
              <div className="mt-1 truncate text-[15px] font-light leading-tight text-[#f5f5f0]">
                {hoveredPlace.title}
              </div>
            </div>
            <span className={`shrink-0 rounded border px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] ${statusClass(hoveredPlace.sourceStatus)}`}>
              {statusLabel(hoveredPlace.sourceStatus)}
            </span>
          </div>
          <p className="line-clamp-3 text-[11px] leading-relaxed text-[#a8a8a0]">
            {hoveredPlace.summary}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[#2a2a28] pt-2">
            <div>
              <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#6b7280]">Type</div>
              <div className="mt-1 truncate text-[11px] text-[#c8c8c0]">{hoveredPlace.placeType}</div>
            </div>
            <div>
              <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#6b7280]">Coords</div>
              <div className="mt-1 truncate text-[11px] text-[#c8c8c0]">
                {hoveredPlace.hasRealCoordinates ? 'verified' : hoveredPlace.coordinateStatus}
              </div>
            </div>
          </div>
          <div className="mt-2 font-mono text-[8px] uppercase tracking-[0.14em] text-[#6b7280]">
            Click to open dossier
          </div>
        </div>
      )}
      <div
        className="absolute left-4 top-4 z-20 flex flex-col overflow-hidden rounded bg-white text-[#111] shadow-lg"
        onPointerDown={event => event.stopPropagation()}
      >
        <button className="h-9 w-10 border-b border-black/10 text-2xl leading-none" onClick={() => setZoom(z + 1)}>
          +
        </button>
        <button className="h-9 w-10 text-2xl leading-none" onClick={() => setZoom(z - 1)}>
          -
        </button>
      </div>
      <div className="absolute bottom-2 left-3 text-[10px] text-[#8b8f98]">
        &copy; OpenStreetMap &copy; CARTO
      </div>
    </div>
  )
}

function includesNeedle(value: string | undefined, needles: string[]) {
  if (!value) return false
  const normalized = value.toLowerCase()
  return needles.some(needle => normalized.includes(needle.toLowerCase()))
}

function mediumCoverage(research: IndigoResearchBrief | null, places: AtlasPlace[]) {
  const evidenceSets = places.length > 0
    ? places.map(place => place.evidenceMediums)
    : (research?.findings ?? []).map(finding => finding.evidence_mediums ?? [])
  return MEDIUMS.map(medium => ({
    ...medium,
    count: evidenceSets.filter(items =>
      items.some(item => includesNeedle(item, medium.needles)),
    ).length,
  }))
}

function coordinatePolicyLabel(policy: string | undefined) {
  if (!policy) return '当前点位由研究线索生成；可拖拽地图、缩放并点击编号查看地点档案。'
  const normalized = policy.toLowerCase()
  if (normalized.includes('null') || normalized.includes('needs_geocoding') || normalized.includes('interpretive')) {
    return '当前先以候选位置周边生成可探索点位；真实经纬度可在后续地理编码后替换。'
  }
  return policy
}

export function IndigoResearchStage({
  candidate,
  research,
  loading,
  onStartWriting,
  onResearchAction,
  onBack,
}: Props) {
  const researchReadiness = readiness(research)
  const sourceRecords = useMemo(() => sourceLibrary(research), [research])
  const places = useMemo(() => atlasPlaces(candidate, research, sourceRecords), [candidate, research, sourceRecords])
  const zones = useMemo(() => zoneSummaries(places), [places])
  const coverage = useMemo(() => mediumCoverage(research, places), [research, places])
  const placePulse = useMemo(() => {
    const backedCount = places.filter(isSourceBackedPlace).length
    return {
      backedCount,
      unsupportedCount: places.length - backedCount,
    }
  }, [places])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedPlace = places.find(place => place.id === selectedId) ?? places[0] ?? null

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1180px] px-8 py-10">
        <div className="mb-8">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-[#2d7a7a]">
            Stage 1 · Neighborhood Atlas
          </p>
          <h1 className="text-[32px] font-light leading-tight text-[#f5f5f0]">把邻里调研做成可探索的文化地图</h1>
          <p className="mt-2 text-[13px] font-light italic text-[#8b8b84]">
            {candidate.city} · {candidate.neighborhood} · {candidate.display}
          </p>
        </div>

        {loading && !research ? (
          <ResearchSkeleton />
        ) : research ? (
          <div className="space-y-7">
            <AtlasHero
              candidate={candidate}
              atlas={research.atlas ?? null}
              places={places}
              selectedPlace={selectedPlace}
              readiness={researchReadiness}
              pulse={placePulse}
              onSelect={setSelectedId}
            />

            <div className="grid grid-cols-1 gap-7 xl:grid-cols-[250px_minmax(0,1fr)]">
              <AtlasRail
                atlas={research.atlas ?? null}
                zones={zones}
                coverage={coverage}
                places={places}
                selectedId={selectedPlace?.id ?? null}
                onSelect={setSelectedId}
              />
              <PlaceDossier
                place={selectedPlace}
                disabled={loading}
                onResearchAction={onResearchAction}
              />
            </div>

            <OpenQuestions questions={research.questions} />
          </div>
        ) : (
          <section className="border-y border-[#2a2a28] bg-[#141412]/80 px-5 py-5">
            <p className="text-[14px] text-[#a8a8a0]">还没有研究稿。可以在右侧输入补充信息，或回到选址重新开始。</p>
          </section>
        )}

        <div className="mt-10 flex items-center justify-between border-t border-[#2a2a28] pt-7">
          <button
            onClick={onBack}
            className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.2em] text-[#6b7280] hover:text-[#c8a96e]"
          >
            ← 改选址
          </button>
          <div className="flex flex-col items-end gap-2">
            {researchReadiness.unsupportedCount > 0 && research && (
              <span className="max-w-[400px] text-right text-[11px] leading-relaxed text-[#6b7280]">
                内部研究模式：{researchReadiness.unsupportedCount} 条线索仍待核，但不会阻断 Stage 2。
              </span>
            )}
            <button
              onClick={onStartWriting}
              disabled={loading}
              className="cursor-pointer rounded bg-[#c8a96e] px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.2em] text-[#0f0f0f] transition hover:bg-[#d4ba82] disabled:cursor-not-allowed disabled:opacity-35"
            >
              开始 Stage 2 · 写故事
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AtlasHero({
  candidate,
  atlas,
  places,
  selectedPlace,
  readiness: researchReadiness,
  pulse,
  onSelect,
}: {
  candidate: GeoResult
  atlas: IndigoResearchBrief['atlas']
  places: AtlasPlace[]
  selectedPlace: AtlasPlace | null
  readiness: ReturnType<typeof readiness>
  pulse: { backedCount: number; unsupportedCount: number }
  onSelect: (id: string) => void
}) {
  return (
    <section className="grid grid-cols-1 overflow-hidden border-y border-[#2a2a28] bg-[#10100f]/90 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="relative min-h-[420px]">
        <AtlasRasterMap candidate={candidate} places={places} selectedPlace={selectedPlace} onSelect={onSelect} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#10100f] to-transparent px-5 pb-5 pt-20">
          <div className="max-w-[560px]">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#c8a96e]">
              {atlas ? atlas.title : 'Interactive Research Map'}
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-[#c8c8c0]">
              {coordinatePolicyLabel(atlas?.coordinate_policy)}
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-[#2a2a28] px-5 py-5 lg:border-l lg:border-t-0">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#2d7a7a]">Atlas Pulse</div>
        <div className="mt-5 grid grid-cols-3 gap-4 lg:grid-cols-1">
          <Metric label="地点" value={places.length} />
          <Metric label="已支撑" value={pulse.backedCount} />
          <Metric label="待验证" value={pulse.unsupportedCount} />
        </div>
        <div className="mt-5 border-t border-[#2a2a28] pt-4">
          <div className="text-[13px] leading-snug text-[#f5f5f0]">
            {researchReadiness.hasCultureReference ? '在地文化已有来源' : '在地文化待补 source'}
          </div>
          <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[#6b7280]">culture risk</div>
        </div>
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-mono text-[22px] leading-none text-[#f5f5f0]">{value}</div>
      <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[#6b7280]">{label}</div>
    </div>
  )
}

function AtlasRail({
  atlas,
  zones,
  coverage,
  places,
  selectedId,
  onSelect,
}: {
  atlas: IndigoResearchBrief['atlas']
  zones: ZoneSummary[]
  coverage: Array<{ key: string; label: string; count: number }>
  places: AtlasPlace[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const zoneCounts = new globalThis.Map(zones.map(zone => [zone.name, zone]))
  const regions = atlas?.regions ?? []
  const layers = atlas?.layers ?? []

  return (
    <aside className="space-y-7 border-y border-[#2a2a28] bg-[#10100f]/70 px-4 py-5 xl:sticky xl:top-6 xl:self-start">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#2d7a7a]">Study Zones</div>
        <div className="mt-4 space-y-3">
          {regions.length > 0 ? (
            regions.map(region => {
              const count = zoneCounts.get(region.name)
              return (
                <div key={region.id} className="border-b border-[#2a2a28] pb-3 last:border-b-0">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-[12px] leading-snug text-[#f5f5f0]">{region.name}</span>
                    <span className="shrink-0 text-[11px] text-[#6b7280]">
                      {count ? `${count.backed}/${count.count}` : region.boundary_status ?? '待绘制'}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.12em] text-[#6b7280]">
                    {region.role} · {region.boundary_status ?? 'interpretive'}
                  </div>
                  <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-[#8b8b84]">{region.summary}</p>
                </div>
              )
            })
          ) : (
            zones.map(zone => (
              <div key={zone.name} className="border-b border-[#2a2a28] pb-3 last:border-b-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12px] leading-snug text-[#f5f5f0]">{zone.name}</span>
                  <span className="text-[11px] text-[#6b7280]">{zone.backed}/{zone.count}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#c8a96e]">Places</div>
        <div className="mt-3 space-y-1">
          {places.map(place => (
            <button
              key={place.id}
              onClick={() => onSelect(place.id)}
              className={`w-full cursor-pointer border-l px-3 py-2 text-left transition ${
                selectedId === place.id
                  ? 'border-[#c8a96e] bg-[#1a1a18] text-[#f5f5f0]'
                  : 'border-[#2a2a28] text-[#8b8b84] hover:border-[#6b7280] hover:text-[#f5f5f0]'
              }`}
            >
              <div className="text-[12px] leading-snug">{place.title}</div>
              <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#6b7280]">
                {String(place.index).padStart(2, '0')} · {place.placeType}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#c8a96e]">Media Layers</div>
        {layers.length > 0 ? (
          <div className="mt-3 space-y-3">
            {layers.map(layer => (
              <div key={layer.key} className="border-b border-[#2a2a28] pb-3 last:border-b-0">
                <div className="flex items-center justify-between gap-3 text-[11px]">
                  <span className="text-[#a8a8a0]">{layer.label}</span>
                  <span className={layer.status === 'source_backed' ? 'text-[#2d7a7a]' : 'text-[#6b7280]'}>
                    {layer.status}
                  </span>
                </div>
                <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.12em] text-[#6b7280]">{layer.medium}</div>
                <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[#8b8b84]">{layer.description}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {coverage.map(item => (
              <div key={item.key} className="flex items-center justify-between gap-3 text-[11px]">
                <span className="text-[#8b8b84]">{item.label}</span>
                <span className={item.count > 0 ? 'text-[#2d7a7a]' : 'text-[#6b7280]'}>{item.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}

function PlaceDossier({
  place,
  disabled,
  onResearchAction,
}: {
  place: AtlasPlace | null
  disabled: boolean
  onResearchAction: (instruction: string) => void
}) {
  if (!place) {
    return (
      <section className="border-y border-[#2a2a28] bg-[#141412]/70 px-5 py-5">
        <p className="text-[14px] text-[#8b8b84]">还没有地点档案。</p>
      </section>
    )
  }

  const backed = isSourceBackedPlace(place)
  const mediums = place.evidenceMediums
  const openQuestions = place.openQuestions
  const mediumHint = mediums.length > 0 ? mediums.join('、') : '图书馆、档案库、地图、影像、报纸或实地观察'

  return (
    <section className="border-y border-[#2a2a28] bg-[#141412]/70">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_290px]">
        <div className="px-6 py-6">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className="font-mono text-[10px] text-[#6b7280]">{String(place.index).padStart(2, '0')}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#2d7a7a]">{place.zone}</span>
            <span className={`rounded border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] ${statusClass(place.sourceStatus)}`}>
              {statusLabel(place.sourceStatus)}
            </span>
          </div>
          <h2 className="text-[24px] font-light leading-tight text-[#f5f5f0]">{place.title}</h2>
          {!backed && <p className="mt-2 text-[12px] leading-relaxed text-[#c8a96e]">当前作为内部研究 hypothesis，可进入 Stage 2 做方向性转译。</p>}

          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div>
              <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#2d7a7a]">Place Dossier</div>
              <p className="mt-2 text-[14px] leading-relaxed text-[#c8c8c0]">{place.summary}</p>
              {(place.historicalNote || place.culturalNote) && (
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {place.historicalNote && (
                    <div className="border-l border-[#2a2a28] pl-3">
                      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#6b7280]">History</div>
                      <p className="mt-1 text-[12px] leading-relaxed text-[#8b8b84]">{place.historicalNote}</p>
                    </div>
                  )}
                  {place.culturalNote && (
                    <div className="border-l border-[#2a2a28] pl-3">
                      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#6b7280]">Culture</div>
                      <p className="mt-1 text-[12px] leading-relaxed text-[#8b8b84]">{place.culturalNote}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="border-t border-[#2a2a28] pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
              <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#c8a96e]">Coordinates</div>
              <p className="mt-2 font-mono text-[11px] leading-relaxed text-[#6b7280]">
                {place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-[#6b7280]">
                {place.hasRealCoordinates ? '已由 atlas 数据提供坐标。' : `当前为研究台占位坐标：${place.coordinateStatus}。`}
              </p>
            </div>
          </div>

          <div className="mt-7 border-t border-[#2a2a28] pt-5">
            <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#2d7a7a]">Design Translation</div>
            <p className="mt-2 border-l border-[#2d7a7a]/50 pl-3 text-[13px] leading-relaxed text-[#8b8b84]">
              {place.designRelevance}
            </p>
          </div>

          <div className="mt-7 grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#c8a96e]">Evidence Needed</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {mediums.length > 0 ? (
                  mediums.map(item => (
                    <span key={item} className="border border-[#2a2a28] px-2 py-1 text-[11px] leading-none text-[#8b8b84]">
                      {item}
                    </span>
                  ))
                ) : (
                  <span className="text-[12px] leading-relaxed text-[#6b7280]">需要先拆证据媒介。</span>
                )}
              </div>
            </div>
            <div>
              <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#c8a96e]">Open Questions</div>
              <p className="mt-2 text-[12px] leading-relaxed text-[#6b7280]">
                {openQuestions.length > 0 ? openQuestions.join(' / ') : '暂无。'}
              </p>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 border-t border-[#2a2a28] pt-4">
            <InlineAction
              label="补查这个地点"
              disabled={disabled}
              onClick={() => onResearchAction(`请把「${place.title}」作为 Neighborhood Atlas 的地点档案来补查：优先从${mediumHint}入手，补充真实地点、历史脉络、图片 reference、source package、locator 和 usage_note。`)}
            />
            <InlineAction
              label="补真实图片"
              disabled={disabled}
              onClick={() => onResearchAction(`请为「${place.title}」补充内部 reference images：优先返回可视图片、caption/alt、上下文和 source_url；rights_status 默认 reference_only。`)}
            />
            <InlineAction
              label="退回假设"
              disabled={disabled}
              onClick={() => onResearchAction(`请把「${place.title}」标记为 needs_verification hypothesis，并列出后续需要补哪些 source package。`)}
            />
          </div>
        </div>

        <aside className="border-t border-[#2a2a28] px-5 py-5 lg:border-l lg:border-t-0">
          <ReferenceImages place={place} />
          <EvidenceChain sources={place.sources} records={place.records} />
        </aside>
      </div>
    </section>
  )
}

function stableLock(value: string) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash % 100000
}

function referenceImageUrl(place: AtlasPlace, index: number) {
  const typeKeywords: Record<string, string> = {
    landmark: 'landmark,architecture',
    street: 'street,city',
    market: 'market,street',
    archive: 'archive,library',
    museum: 'museum,architecture',
    community: 'neighborhood,street',
    craft: 'craft,artisan',
    food: 'food,market',
    nightlife: 'night,street',
    landscape: 'urban,landscape',
    cultural_signal: 'culture,street',
    hypothesis: 'city,architecture',
  }
  const keywords = [
    typeKeywords[place.placeType] ?? 'city,architecture',
    place.zone,
    place.title,
    'urban',
  ].join(',')
  return `https://loremflickr.com/640/480/${encodeURIComponent(keywords)}?lock=${stableLock(`${place.id}-${index}`)}`
}

function ReferenceImages({ place }: { place: AtlasPlace }) {
  const references = place.imageReferences
  const fallbackReferences: IndigoAtlasImageReference[] = [0, 1, 2, 3].map(index => ({
    title: `${place.title} reference ${index + 1}`,
    caption: `${place.title} 的内部研究参考图，用于视觉方向讨论。`,
    image_url: referenceImageUrl(place, index),
    status: 'internal_reference',
    rights_status: 'reference_only',
  }))
  const visibleReferences = references.length > 0
    ? references.map((reference, index) => ({
      ...reference,
      image_url: reference.image_url || referenceImageUrl(place, index),
      caption: reference.caption || reference.title || `${place.title} 的内部研究参考图`,
      status: reference.status || 'internal_reference',
      rights_status: reference.rights_status || 'reference_only',
    }))
    : fallbackReferences
  const hasSourcedReferences = visibleReferences.some(reference => reference.status === 'sourced' || Boolean(reference.source_url))

  return (
    <div className="mb-7">
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#c8a96e]">Reference Images</div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {visibleReferences.slice(0, 4).map((reference, i) => (
          <div key={`${reference.title ?? 'reference'}-${i}`} className="overflow-hidden border border-[#2a2a28] bg-[#10100f]">
            <div className="aspect-[4/3]">
              {reference.image_url ? (
                <img
                  src={reference.image_url}
                  alt={reference.alt_text || reference.caption || reference.title || 'Reference image'}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full bg-[linear-gradient(135deg,rgba(45,122,122,0.16),rgba(200,169,110,0.08))]" />
              )}
            </div>
            <div className="border-t border-[#2a2a28] px-2 py-2">
              <div className="line-clamp-2 text-[10px] leading-snug text-[#a8a8a0]">
                {reference.caption || reference.title || 'Reference image slot'}
              </div>
              <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.12em] text-[#6b7280]" title={reference.notes || undefined}>
                {reference.status ?? 'to_source'} · {reference.rights_status ?? 'reference_only'}
              </div>
              {reference.source_url && (
                <a className="mt-1 block truncate text-[10px] text-[#2d7a7a] hover:text-[#3a9a9a]" href={reference.source_url} target="_blank" rel="noreferrer">
                  {reference.source_title || reference.source_url}
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-[#6b7280]">
        {hasSourcedReferences
          ? '公开来源参考图：用于内部方向讨论，进入 PPT 前仍建议确认最终授权和出处。'
          : '暂无可抓取公开来源图时显示内部 fallback，用于方向讨论和灵感判断。'}
      </p>
    </div>
  )
}

function EvidenceChain({
  sources,
  records,
}: {
  sources: IndigoResearchSource[]
  records: IndigoResearchSourceRecord[]
}) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#c8a96e]">Evidence Chain</div>
      <div className="mt-3 space-y-3">
        {sources.map((source, i) => (
          <div key={`${source.title}-${i}`} className="text-[11px] leading-relaxed text-[#6b7280]">
            <div className="text-[#a8a8a0]">{source.title}</div>
            <div>{[source.publisher, source.medium, source.collection, source.locator].filter(Boolean).join(' · ')}</div>
            {source.usage_note && <div className="mt-1">{source.usage_note}</div>}
            {source.url && (
              <a className="mt-1 block truncate text-[#2d7a7a] hover:text-[#3a9a9a]" href={source.url} target="_blank" rel="noreferrer">
                {source.url}
              </a>
            )}
          </div>
        ))}

        {records.map(record => (
          <div key={`${record.title}-${record.source_type}`} className="text-[11px] leading-relaxed text-[#6b7280]">
            <div className="text-[#a8a8a0]">{record.title}</div>
            <div>{sourceStatusLabel(record.status)} · {[record.institution, record.source_type, record.locator].filter(Boolean).join(' · ')}</div>
            {record.relevance && <div className="mt-1">{record.relevance}</div>}
          </div>
        ))}

        {sources.length === 0 && records.length === 0 && (
          <p className="text-[11px] leading-relaxed text-[#6b7280]">
            还没有挂接来源。这里需要 source package：文字、图片、出处、locator 和 usage note。
          </p>
        )}
      </div>
    </div>
  )
}

function OpenQuestions({ questions }: { questions: string[] }) {
  return (
    <section className="grid grid-cols-1 gap-5 border-y border-[#2a2a28] bg-[#10100f]/75 px-5 py-5 lg:grid-cols-[220px_1fr]">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#2d7a7a]">Open Questions</div>
        <div className="mt-3 text-[13px] leading-relaxed text-[#6b7280]">
          这些问题会回到地图点位、source package 和后续 story arc。
        </div>
      </div>
      {questions.length > 0 ? (
        <div className="space-y-3">
          {questions.map((item, i) => (
            <div key={item} className="flex items-start gap-3 border-b border-[#2a2a28] pb-3 last:border-b-0">
              <span className="mt-0.5 font-mono text-[10px] text-[#c8a96e]">{String(i + 1).padStart(2, '0')}</span>
              <span className="text-[14px] leading-relaxed text-[#c8c8c0]">{item}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[12px] leading-relaxed text-[#6b7280]">暂无讨论问题。</p>
      )}
    </section>
  )
}

function InlineAction({
  label,
  disabled,
  onClick,
}: {
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.14em] text-[#6b7280] transition hover:text-[#c8a96e] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  )
}

function ResearchSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-[420px] border-y border-[#2a2a28] bg-[#10100f]" />
      <div className="grid grid-cols-1 gap-7 xl:grid-cols-[250px_minmax(0,1fr)]">
        <div className="h-[520px] border-y border-[#2a2a28] bg-[#10100f]" />
        <div className="h-[620px] border-y border-[#2a2a28] bg-[#141412]" />
      </div>
    </div>
  )
}
