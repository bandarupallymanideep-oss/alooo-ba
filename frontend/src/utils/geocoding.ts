/**
 * Reverse geocoding and place search utilities using OpenStreetMap Nominatim.
 *
 * Requirements:
 * - Free open service, no paid API key required.
 * - Graceful degradation: never throws or crashes if network is offline or throttled.
 * - Debounced requests to respect OSM Nominatim usage policy (max 1 req/sec).
 */

let lastRequestTime = 0;

async function throttle(): Promise<void> {
  const now = Date.now();
  const timeSinceLast = now - lastRequestTime;
  if (timeSinceLast < 1000) {
    await new Promise((resolve) => setTimeout(resolve, 1000 - timeSinceLast));
  }
  lastRequestTime = Date.now();
}

export interface GeocodingResult {
  displayName: string;
  shortAddress: string;
  latitude: number;
  longitude: number;
}

/**
 * Reverse geocode latitude/longitude into a human-readable location description.
 * Returns null if geocoding fails or is unavailable.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return null;

  try {
    await throttle();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    clearTimeout(timer);

    if (!response.ok) return null;
    const data = await response.json();

    if (!data || !data.address) {
      return data?.display_name?.split(',').slice(0, 3).join(',').trim() || null;
    }

    const addr = data.address;
    // Build a succinct, meaningful location string (e.g. "NH-48, Lonavala, Maharashtra" or "Ring Road, Junction 4")
    const road = addr.road || addr.highway || addr.pedestrian || addr.street;
    const neighborhood = addr.suburb || addr.neighbourhood || addr.quarter || addr.locality;
    const city = addr.city || addr.town || addr.village || addr.county;
    const state = addr.state;

    const parts = [road, neighborhood, city, state].filter(Boolean);
    if (parts.length > 0) {
      return parts.slice(0, 3).join(', ');
    }

    return data.display_name?.split(',').slice(0, 3).join(',').trim() || null;
  } catch (e) {
    // Graceful fallback - offline or request aborted, user can enter location manually
    return null;
  }
}

/**
 * Search places or addresses using OpenStreetMap Nominatim.
 * Returns a list of candidate results.
 */
export async function searchPlaces(query: string): Promise<GeocodingResult[]> {
  if (!query || query.trim().length < 2) return [];

  try {
    await throttle();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
      query.trim()
    )}&limit=5&addressdetails=1`;

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    clearTimeout(timer);

    if (!response.ok) return [];
    const data = await response.json();

    if (!Array.isArray(data)) return [];

    return data.map((item: any) => {
      const addr = item.address || {};
      const road = addr.road || addr.highway || addr.street;
      const city = addr.city || addr.town || addr.village || addr.county;
      const state = addr.state;
      const short = [road, city, state].filter(Boolean).join(', ') || item.display_name?.split(',')[0];

      return {
        displayName: item.display_name,
        shortAddress: short,
        latitude: parseFloat(item.lat),
        longitude: parseFloat(item.lon),
      };
    });
  } catch (e) {
    return [];
  }
}
