/** Google Maps deep links for field route / outfall navigation (WV field spine). */

export function mapsSearchUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

export function mapsDirUrl(coords: Array<{ lat: number; lng: number }>): string {
  if (coords.length === 0) return '';
  const path = coords.map((c) => `${c.lat},${c.lng}`).join('/');
  return `https://www.google.com/maps/dir/${path}`;
}

export function mapsSearchQueryUrl(query: string): string {
  const q = query.trim();
  if (!q) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
