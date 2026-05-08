import { Injectable, Logger } from '@nestjs/common';

interface NearbyPlace {
  type: 'hospital' | 'school' | 'supermarket' | 'park' | 'main_road';
  name: string;
  distanceMeters: number;
}

interface LocationContext {
  nearHospital: boolean;
  nearSchool: boolean;
  nearSupermarket: boolean;
  nearPark: boolean;
  nearMainRoad: boolean;
  places: NearbyPlace[];
}

@Injectable()
export class LocationServicesService {
  private readonly logger = new Logger(LocationServicesService.name);
  private readonly SEARCH_RADIUS = 1000; // 1km radius

  async getLocationContext(lat: number, lng: number): Promise<LocationContext> {
    try {
      const query = `
        [out:json][timeout:10];
        (
          node["amenity"="hospital"](around:${this.SEARCH_RADIUS},${lat},${lng});
          node["amenity"="clinic"](around:${this.SEARCH_RADIUS},${lat},${lng});
          node["amenity"="school"](around:${this.SEARCH_RADIUS},${lat},${lng});
          node["shop"="supermarket"](around:${this.SEARCH_RADIUS},${lat},${lng});
          node["shop"="mall"](around:${this.SEARCH_RADIUS},${lat},${lng});
          node["leisure"="park"](around:${this.SEARCH_RADIUS},${lat},${lng});
          way["highway"~"^(primary|secondary|trunk|motorway)$"](around:500,${lat},${lng});
        );
        out body;
      `;

      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) throw new Error(`Overpass API error: ${response.status}`);

      const data = await response.json() as { elements: any[] };
      const elements = data.elements ?? [];

      const places: NearbyPlace[] = [];
      let nearHospital = false;
      let nearSchool = false;
      let nearSupermarket = false;
      let nearPark = false;
      let nearMainRoad = false;

      for (const el of elements) {
        const tags = el.tags ?? {};
        const elLat = el.lat ?? el.center?.lat;
        const elLng = el.lon ?? el.center?.lon;
        const dist = elLat && elLng
          ? this.haversineDistance(lat, lng, elLat, elLng)
          : 0;

        if (tags.amenity === 'hospital' || tags.amenity === 'clinic') {
          nearHospital = true;
          places.push({ type: 'hospital', name: tags.name ?? 'مستشفى', distanceMeters: dist });
        } else if (tags.amenity === 'school') {
          nearSchool = true;
          places.push({ type: 'school', name: tags.name ?? 'مدرسة', distanceMeters: dist });
        } else if (tags.shop === 'supermarket' || tags.shop === 'mall') {
          nearSupermarket = true;
          places.push({ type: 'supermarket', name: tags.name ?? 'سوبرماركت', distanceMeters: dist });
        } else if (tags.leisure === 'park') {
          nearPark = true;
          places.push({ type: 'park', name: tags.name ?? 'حديقة', distanceMeters: dist });
        } else if (['primary', 'secondary', 'trunk', 'motorway'].includes(tags.highway)) {
          nearMainRoad = true;
          places.push({ type: 'main_road', name: tags.name ?? 'طريق رئيسي', distanceMeters: dist });
        }
      }

      this.logger.log(`LocationContext lat=${lat} lng=${lng} found=${places.length} places`);

      return { nearHospital, nearSchool, nearSupermarket, nearPark, nearMainRoad, places };

    } catch (error) {
      this.logger.warn(`LocationServices failed: ${(error as Error).message} — returning empty context`);
      return {
        nearHospital: false,
        nearSchool: false,
        nearSupermarket: false,
        nearPark: false,
        nearMainRoad: false,
        places: [],
      };
    }
  }

  async getCoordinatesForDistrict(districtNameEn: string, city: string): Promise<{ lat: number; lng: number } | null> {
    try {
      const query = `${districtNameEn}, ${city}, Syria`;
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;

      const response = await fetch(url, {
        headers: { 'User-Agent': 'Urbanex-RealEstate/1.0' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) throw new Error(`Nominatim error: ${response.status}`);

      const results = await response.json() as Array<{ lat: string; lon: string }>;
      if (!results.length) return null;

      return {
        lat: parseFloat(results[0].lat),
        lng: parseFloat(results[0].lon),
      };
    } catch (error) {
      this.logger.warn(`Nominatim failed for ${districtNameEn}: ${(error as Error).message}`);
      return null;
    }
  }

  private haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
