import { useEffect, useMemo, useRef, useState } from 'react'

const TILE_SIZE = 256
const CARTO_SUBDOMAINS = ['a', 'b', 'c']

type Size = { width: number; height: number }

type Props = {
  longitude: number
  latitude: number
  zoom?: number
  pitch?: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeLng(lng: number) {
  return ((((lng + 180) % 360) + 360) % 360) - 180
}

function lngLatToWorld(longitude: number, latitude: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom
  const lat = clamp(latitude, -85.05112878, 85.05112878)
  const sin = Math.sin((lat * Math.PI) / 180)
  return {
    x: ((normalizeLng(longitude) + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  }
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

export function MapBackdrop({ longitude, latitude, zoom = 15.4 }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const size = useElementSize(ref)
  const z = clamp(Math.round(zoom), 2, 18)
  const center = lngLatToWorld(longitude, latitude, z)
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

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <div
        ref={ref}
        className="absolute inset-0"
        style={{
          filter: 'blur(10px) saturate(0.5) brightness(0.42)',
        }}
      >
        {tiles.map(tile => (
          <img
            key={tile.key}
            src={tile.url}
            alt=""
            draggable={false}
            className="absolute max-w-none"
            style={{ width: TILE_SIZE, height: TILE_SIZE, left: tile.left, top: tile.top }}
          />
        ))}
      </div>
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 90% 70% at 35% 40%, transparent 0%, rgba(15,15,15,0.88) 70%), ' +
            'linear-gradient(180deg, rgba(15,15,15,0.55) 0%, rgba(15,15,15,0.94) 100%)',
        }}
      />
    </div>
  )
}
