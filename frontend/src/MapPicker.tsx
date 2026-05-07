import Map, { Marker, NavigationControl } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string

export type GeoResult = {
  city: string
  neighborhood: string
  display: string
  longitude: number
  latitude: number
}

async function _request(url: string): Promise<GeoResult | null> {
  const resp = await fetch(url)
  if (resp.status === 401 || resp.status === 403) {
    throw new Error('Mapbox token 无效或当前域名不在白名单。去 account.mapbox.com 把 http://localhost:5174 加进 URL restrictions（或临时去掉所有限制）。')
  }
  if (!resp.ok) {
    throw new Error(`Mapbox 请求失败 (HTTP ${resp.status})`)
  }
  const data = await resp.json()
  if (!data.features?.length) return null

  const f0 = data.features[0]
  const [lng, lat] = f0.center

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
    city = f0.context?.find((c: { id: string }) => c.id.startsWith('place'))?.text || f0.text || ''
  }
  if (!neighborhood) neighborhood = f0.text || ''

  return {
    city,
    neighborhood,
    display: f0.place_name || '',
    longitude: lng,
    latitude: lat,
  }
}

export async function reverseGeocode(longitude: number, latitude: number): Promise<GeoResult | null> {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${MAPBOX_TOKEN}&language=zh&types=neighborhood,locality,place,district`
  return _request(url)
}

export async function forwardGeocode(query: string): Promise<GeoResult | null> {
  const cleaned = query
    .replace(/我想要|我要|帮我|麻烦|做一?个?|生成|创建|来一?个?|的?\s*PPT|的?\s*ppt/gi, '')
    .replace(/[，,。.！!？?；;]/g, ' ')
    .trim()
  if (!cleaned) return null
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cleaned)}.json?access_token=${MAPBOX_TOKEN}&language=zh&limit=1`
  return _request(url)
}

type Props = {
  viewState: { longitude: number; latitude: number; zoom: number }
  onViewStateChange: (v: { longitude: number; latitude: number; zoom: number }) => void
  pin: { longitude: number; latitude: number } | null
  onMapClick: (lng: number, lat: number) => void
}

export function MapPicker({ viewState, onViewStateChange, pin, onMapClick }: Props) {
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
        onMove={evt => onViewStateChange(evt.viewState)}
        onClick={e => onMapClick(e.lngLat.lng, e.lngLat.lat)}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        style={{ width: '100%', height: '100%' }}
      >
        <NavigationControl position="bottom-right" />
        {pin && (
          <Marker longitude={pin.longitude} latitude={pin.latitude} anchor="bottom">
            <div className="w-3 h-3 bg-[#c8a96e] rounded-full ring-2 ring-[#c8a96e]/30" />
          </Marker>
        )}
      </Map>
    </div>
  )
}
