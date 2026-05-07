import { useState, useCallback } from 'react'
import Map, { Marker, NavigationControl } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string

type ReverseResult = {
  city: string
  neighborhood: string
  display: string
  longitude: number
  latitude: number
}

async function reverseGeocode(longitude: number, latitude: number, language = 'zh'): Promise<ReverseResult | null> {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${MAPBOX_TOKEN}&language=${language}&types=neighborhood,locality,place,district`
  const resp = await fetch(url)
  if (!resp.ok) return null
  const data = await resp.json()
  if (!data.features?.length) return null

  let city = ''
  let neighborhood = ''
  for (const f of data.features) {
    const ptype = f.place_type?.[0]
    if (ptype === 'place' && !city) city = f.text
    if ((ptype === 'neighborhood' || ptype === 'locality' || ptype === 'district') && !neighborhood) {
      neighborhood = f.text
    }
  }
  if (!city) {
    const placeFeature = data.features.find((f: { place_type?: string[] }) => f.place_type?.[0] === 'place')
    city = placeFeature?.text || data.features[0]?.context?.find((c: { id: string }) => c.id.startsWith('place'))?.text || ''
  }
  if (!neighborhood) {
    neighborhood = data.features[0]?.text || ''
  }

  return {
    city,
    neighborhood,
    display: data.features[0]?.place_name || '',
    longitude,
    latitude,
  }
}

type Props = {
  onConfirm: (city: string, neighborhood: string) => void
}

export function MapPicker({ onConfirm }: Props) {
  const [picked, setPicked] = useState<ReverseResult | null>(null)
  const [resolving, setResolving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [viewState, setViewState] = useState({
    longitude: 116.4074,
    latitude: 39.9042,
    zoom: 11,
  })

  const handleClick = useCallback(async (e: { lngLat: { lng: number; lat: number } }) => {
    setResolving(true)
    const r = await reverseGeocode(e.lngLat.lng, e.lngLat.lat)
    setResolving(false)
    if (r) setPicked(r)
  }, [])

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?access_token=${MAPBOX_TOKEN}&language=zh&limit=1`
      const resp = await fetch(url)
      const data = await resp.json()
      const f = data.features?.[0]
      if (f?.center) {
        const [lng, lat] = f.center
        setViewState({ longitude: lng, latitude: lat, zoom: 13 })
        const r = await reverseGeocode(lng, lat)
        if (r) setPicked(r)
      }
    } finally {
      setSearching(false)
    }
  }, [searchQuery])

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex items-center justify-center h-full text-[#6b7280] text-sm">
        Missing VITE_MAPBOX_TOKEN
      </div>
    )
  }

  return (
    <div className="relative w-full h-full">
      <Map
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        onClick={handleClick}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        style={{ width: '100%', height: '100%' }}
      >
        <NavigationControl position="bottom-right" />
        {picked && (
          <Marker longitude={picked.longitude} latitude={picked.latitude} anchor="bottom">
            <div className="w-3 h-3 bg-[#c8a96e] rounded-full ring-2 ring-[#c8a96e]/30" />
          </Marker>
        )}
      </Map>

      <div className="absolute top-6 left-1/2 -translate-x-1/2 w-[480px] max-w-[90vw]">
        <div className="flex gap-2 bg-[#0f0f0f]/90 backdrop-blur border border-[#2a2a28] rounded p-2">
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="搜索城市或街区，比如「上海 武康路」"
            className="flex-1 bg-transparent text-sm text-[#f5f5f0] placeholder-[#4b4b48] focus:outline-none px-2"
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            className="bg-[#1a1a18] border border-[#2a2a28] text-[#f5f5f0] text-sm px-3 py-1 rounded hover:border-[#c8a96e] disabled:opacity-40 cursor-pointer"
          >
            {searching ? '...' : '搜索'}
          </button>
        </div>
        <div className="text-xs text-[#6b7280] mt-2 text-center">点击地图任意位置选择街区</div>
      </div>

      {(resolving || picked) && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[480px] max-w-[90vw] bg-[#0f0f0f]/95 backdrop-blur border border-[#2a2a28] rounded-lg p-5">
          {resolving && <div className="text-sm text-[#6b7280]">识别地点中...</div>}
          {picked && !resolving && (
            <>
              <div className="text-xs tracking-widest text-[#6b7280] uppercase mb-2">已选择</div>
              <div className="text-2xl font-light text-[#f5f5f0] mb-1">
                {picked.city}{picked.city && picked.neighborhood ? ' · ' : ''}{picked.neighborhood}
              </div>
              <div className="text-xs text-[#6b7280] mb-4">{picked.display}</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPicked(null)}
                  className="flex-1 bg-[#1a1a18] border border-[#2a2a28] text-[#f5f5f0] text-sm py-2 rounded hover:border-[#c8a96e] cursor-pointer"
                >
                  重选
                </button>
                <button
                  onClick={() => onConfirm(picked.city, picked.neighborhood)}
                  disabled={!picked.city || !picked.neighborhood}
                  className="flex-1 bg-[#c8a96e] text-[#0f0f0f] text-sm font-medium py-2 rounded hover:bg-[#d4ba82] cursor-pointer disabled:opacity-40"
                >
                  生成 PPT
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
