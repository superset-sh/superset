import { AdvancedMarker, Map, Pin } from "@vis.gl/react-google-maps";
import { noop } from "es-toolkit";

interface Props {
  apiKey: string;
  markers?: MarkerData[];
  height?: string;
  center?: { lat: number; lng: number };
  zoom?: number;
  onMarkerClick?: (markerId: string) => void;
}

export function GoogleMap({
  apiKey,
  markers = [],
  height = "200px",
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  onMarkerClick = noop,
}: Props) {
  if (!apiKey) {
    return (
      <MapPlaceholder
        height={height}
        markerCount={markers.length}
        message="Google Maps API 키가 설정되지 않았습니다"
      />
    );
  }

  return (
    <Map
      mapId="delivery-map"
      style={{ height, width: "100%" }}
      zoom={zoom}
      center={center}
      gestureHandling="cooperative"
      disableDoubleClickZoom
      disableDefaultUI
    >
      {markers.map((marker) => (
        <AdvancedMarker
          key={marker.id}
          position={{ lat: marker.lat, lng: marker.lng }}
          onClick={() => onMarkerClick(marker.id)}
        >
          <Pin background="#4285F4" borderColor="#ffffff" glyphColor="#ffffff" />
        </AdvancedMarker>
      ))}
    </Map>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }; // 서울 시청 기준
const DEFAULT_ZOOM = 12;

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface MapPlaceholderProps {
  height: string;
  markerCount: number;
  message?: string;
}

function MapPlaceholder({ height, markerCount, message }: MapPlaceholderProps) {
  return (
    <div
      className="bg-muted relative flex items-center justify-center overflow-hidden rounded-lg"
      style={{ height }}
    >
      {/* 지도 배경 패턴 */}
      <div className="absolute inset-0 opacity-20">
        <div className="grid h-full w-full grid-cols-6 grid-rows-4 gap-px">
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={i}
              className="from-muted-foreground/20 to-muted-foreground/10 bg-gradient-to-br"
            />
          ))}
        </div>
      </div>

      {/* 중앙 콘텐츠 */}
      <div className="z-10 flex flex-col items-center gap-2 text-center">
        <div className="bg-primary/10 flex size-12 items-center justify-center rounded-full">
          <MapPinIcon className="text-primary size-6" />
        </div>
        <div className="space-y-1">
          <p className="text-muted-foreground text-sm font-medium">{message || "지도 미리보기"}</p>
          {markerCount > 0 && (
            <p className="text-muted-foreground/80 text-xs">{markerCount}개 위치 표시됨</p>
          )}
        </div>
      </div>
    </div>
  );
}

function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

export interface MarkerData {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  color?: string;
}
