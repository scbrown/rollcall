export interface Crew {
  id: string;
  name: string;
}

export interface Rider {
  id: string;
  phone: string;
  display_name: string;
  crew_id: string | null;
  muted: number; // 0 | 1
  opted_out: number; // 0 | 1
  welcomed_at: string | null;
  footer_shown_at: string | null;
  created_at: string;
}

export interface RideSession {
  id: string;
  rider_id: string;
  started_at: string;
  expires_at: string;
  ended_at: string | null;
  location_text: string | null;
  lat: number | null;
  lng: number | null;
}
