import { useEffect, useMemo, useRef, useState } from 'react'

const TILE_SIZE = 256
const MIN_ZOOM = 2
const MAX_ZOOM = 18
const CARTO_SUBDOMAINS = ['a', 'b', 'c']

type Point = { x: number; y: number }
type Size = { width: number; height: number }

export type GeoResult = {
  city: string
  neighborhood: string
  display: string
  longitude: number
  latitude: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeLng(lng: number) {
  return ((((lng + 180) % 360) + 360) % 360) - 180
}

function zoomInt(zoom: number) {
  return clamp(Math.round(zoom), MIN_ZOOM, MAX_ZOOM)
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

export async function reverseGeocode(longitude: number, latitude: number): Promise<GeoResult | null> {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
    `&lat=${latitude}&lon=${longitude}&accept-language=zh-CN,zh,en`
  const resp = await fetch(url)
  if (!resp.ok) {
    return {
      city: '坐标点',
      neighborhood: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
      display: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
      longitude,
      latitude,
    }
  }

  const data = await resp.json()
  const address = data.address ?? {}
  const city =
    address.city ||
    address.town ||
    address.municipality ||
    address.county ||
    address.state ||
    '坐标点'
  const neighborhood =
    address.neighbourhood ||
    address.suburb ||
    address.quarter ||
    address.city_district ||
    address.village ||
    address.road ||
    city

  return {
    city,
    neighborhood,
    display: data.display_name || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
    longitude,
    latitude,
  }
}

type Props = {
  viewState: { longitude: number; latitude: number; zoom: number }
  onViewStateChange: (v: { longitude: number; latitude: number; zoom: number }) => void
  pin: { longitude: number; latitude: number } | null
  onMapClick: (lng: number, lat: number) => void
}

export function MapPicker({ viewState, onViewStateChange, pin, onMapClick }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{
    pointerId: number
    start: Point
    center: Point
    moved: boolean
    zoom: number
  } | null>(null)
  const size = useElementSize(ref)
  const z = zoomInt(viewState.zoom)
  const center = lngLatToWorld(viewState.longitude, viewState.latitude, z)
  const topLeft = { x: center.x - size.width / 2, y: center.y - size.height / 2 }

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

  const pinPoint = pin ? lngLatToWorld(pin.longitude, pin.latitude, z) : null

  function setZoom(nextZoom: number) {
    onViewStateChange({
      ...viewState,
      zoom: clamp(nextZoom, MIN_ZOOM, MAX_ZOOM),
    })
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
    onViewStateChange({ ...next, zoom: drag.zoom })
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    dragRef.current = null

    if (drag.moved || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const clickWorld = {
      x: topLeft.x + event.clientX - rect.left,
      y: topLeft.y + event.clientY - rect.top,
    }
    const next = worldToLngLat(clickWorld.x, clickWorld.y, z)
    onMapClick(next.longitude, next.latitude)
  }

  return (
    <div
      ref={ref}
      className="relative w-full h-full overflow-hidden bg-[#101312] cursor-grab active:cursor-grabbing select-none"
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
          className="absolute max-w-none opacity-95"
          style={{ width: TILE_SIZE, height: TILE_SIZE, left: tile.left, top: tile.top }}
        />
      ))}

      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(15,15,15,0.28)_72%)]" />

      {pinPoint && (
        <div
          className="absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#c8a96e] ring-2 ring-[#c8a96e]/40 shadow-[0_0_24px_rgba(200,169,110,0.5)]"
          style={{ left: pinPoint.x - topLeft.x, top: pinPoint.y - topLeft.y }}
        />
      )}

      <div className="absolute left-4 bottom-4 flex flex-col overflow-hidden rounded bg-white text-[#111] shadow-lg">
        <button className="w-11 h-10 text-2xl leading-none border-b border-black/10" onClick={() => setZoom(z + 1)}>
          +
        </button>
        <button className="w-11 h-10 text-2xl leading-none" onClick={() => setZoom(z - 1)}>
          -
        </button>
      </div>

      <div className="absolute left-4 bottom-2 translate-y-full pt-2 text-[11px] text-[#8b8f98]">
        &copy; OpenStreetMap &copy; CARTO
      </div>
    </div>
  )
}
