import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string

type Props = {
  longitude: number
  latitude: number
  zoom?: number
  pitch?: number
}

export function MapBackdrop({ longitude, latitude, zoom = 15.4, pitch = 55 }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!ref.current || !TOKEN) return
    mapboxgl.accessToken = TOKEN
    const map = new mapboxgl.Map({
      container: ref.current,
      style: 'mapbox://styles/mapbox/standard',
      center: [longitude, latitude],
      zoom,
      pitch,
      bearing: -18,
      interactive: false,
      attributionControl: false,
    })

    let raf = 0
    let bearing = -18

    map.on('style.load', () => {
      try {
        map.setConfigProperty('basemap', 'lightPreset', 'dusk')
        map.setConfigProperty('basemap', 'theme', 'monochrome')
        map.setConfigProperty('basemap', 'showPointOfInterestLabels', false)
        map.setConfigProperty('basemap', 'showRoadLabels', false)
        map.setConfigProperty('basemap', 'showTransitLabels', false)
        map.setConfigProperty('basemap', 'showPlaceLabels', false)
      } catch {
        // older Mapbox or non-standard style — fail silently
      }

      const reduceMotion =
        typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (!reduceMotion) {
        const tick = () => {
          bearing += 0.018
          map.setBearing(bearing)
          raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      }
    })

    return () => {
      if (raf) cancelAnimationFrame(raf)
      map.remove()
    }
  }, [longitude, latitude, zoom, pitch])

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <div
        ref={ref}
        className="absolute inset-0"
        style={{
          filter: 'blur(10px) saturate(0.5) brightness(0.42)',
        }}
      />
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
