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
  displayName?: string;
  address?: {
    road?: string;
    suburb?: string;
    city?: string;
    country?: string;
  };
}

@Injectable()
export class LocationServicesService {
  private readonly logger = new Logger(LocationServicesService.name);

  async getLocationContext(lat: number, lng: number): Promise<LocationContext> {
    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(nominatimUrl, {
        headers: {
          'User-Agent': 'Urbanex-RealEstate/1.0 (contact@urbanex.sy)',
          'Accept-Language': 'ar,en',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) throw new Error(`Nominatim error: ${response.status}`);

      const data = await response.json() as { address?: Record<string, string>; display_name?: string; type?: string };
      const address = data.address ?? {};

      const nearHospital = !!(address.hospital || address.clinic || address.healthcare);
      const nearSchool = !!(address.school || address.university || address.college);
      const nearSupermarket = !!(address.supermarket || address.shop || address.marketplace);
      const nearPark = !!(address.park || address.garden || address.leisure);
      const nearMainRoad = !!(
        address.road &&
        (address.road.includes('شارع') ||
          address.road.includes('طريق') ||
          address.road.includes('جادة') ||
          data.type === 'motorway' ||
          data.type === 'trunk' ||
          data.type === 'primary')
      );

      this.logger.log(`LocationContext lat=${lat} lng=${lng} source=nominatim`);

      return {
        nearHospital,
        nearSchool,
        nearSupermarket,
        nearPark,
        nearMainRoad,
        places: [],
        displayName: data.display_name ?? '',
        address: {
          road: address.road ?? '',
          suburb: address.suburb ?? address.neighbourhood ?? '',
          city: address.city ?? address.town ?? address.village ?? '',
          country: address.country ?? 'Syria',
        },
      };
    } catch (error) {
      this.logger.warn(
        `Nominatim failed: ${(error as Error).message} — using district-based fallback`,
      );
      return this.getDistrictBasedContext(lat, lng);
    }
  }

  async getCoordinatesForDistrict(
    district: string,
    city: string,
  ): Promise<{ lat: number; lng: number } | null> {
    const query = encodeURIComponent(`${district}, ${city}, Syria`);
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=sy`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Urbanex-RealEstate/1.0 (contact@urbanex.sy)',
          'Accept-Language': 'ar,en',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) throw new Error(`Nominatim search error: ${response.status}`);

      const results = await response.json() as Array<{ lat: string; lon: string }>;
      if (!results?.length) return null;

      return {
        lat: parseFloat(results[0].lat),
        lng: parseFloat(results[0].lon),
      };
    } catch (error) {
      this.logger.warn(
        `Nominatim geocoding failed for ${district}: ${(error as Error).message}`,
      );
      return this.getDistrictCoordinatesFallback(district);
    }
  }

  private getDistrictCoordinatesFallback(
    district: string,
  ): { lat: number; lng: number } | null {
    const COORDS: Record<string, { lat: number; lng: number }> = {
      'mazzeh':        { lat: 33.5045, lng: 36.2634 },
      'malki':         { lat: 33.5180, lng: 36.2810 },
      'midan':         { lat: 33.4920, lng: 36.3100 },
      'kafr sousa':    { lat: 33.4980, lng: 36.2760 },
      'shaalan':       { lat: 33.5150, lng: 36.2920 },
      'qassaa':        { lat: 33.5200, lng: 36.3050 },
      'baramkeh':      { lat: 33.5100, lng: 36.3100 },
      'rukn al-din':   { lat: 33.5300, lng: 36.3000 },
      'abu rummaneh':  { lat: 33.5160, lng: 36.2870 },
      'jaramana':      { lat: 33.4750, lng: 36.3650 },
      'douma':         { lat: 33.5720, lng: 36.3980 },
      'harasta':       { lat: 33.5580, lng: 36.3820 },
      'darayya':       { lat: 33.4600, lng: 36.2400 },
      'barzeh':        { lat: 33.5450, lng: 36.3200 },
      'qaboun':        { lat: 33.5360, lng: 36.3400 },
      'damascus':      { lat: 33.5138, lng: 36.2765 },
    };
    return COORDS[district.toLowerCase()] ?? COORDS['damascus'];
  }

  private getDistrictBasedContext(lat: number, lng: number): LocationContext {
    this.logger.log(`LocationContext lat=${lat} lng=${lng} source=static_fallback`);
    return {
      nearHospital: false,
      nearSchool: true,
      nearSupermarket: true,
      nearPark: false,
      nearMainRoad: true,
      places: [],
      displayName: '',
      address: { road: '', suburb: '', city: 'دمشق', country: 'Syria' },
    };
  }
}
