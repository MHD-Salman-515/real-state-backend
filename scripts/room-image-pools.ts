export type RoomType =
  | 'LIVING'
  | 'KITCHEN'
  | 'BATHROOM'
  | 'BEDROOM'
  | 'EXTERIOR'
  | 'BALCONY'
  | 'DINING';

const buildPool = (query: string, count = 120) =>
  Array.from({ length: count }, (_, i) => `https://source.unsplash.com/1600x1000/?${query}&sig=${i + 1}`);

export const ROOM_IMAGE_POOLS: Record<RoomType, string[]> = {
  LIVING: buildPool('empty,living-room,interior,modern'),
  KITCHEN: buildPool('empty,kitchen,interior,modern'),
  BATHROOM: buildPool('empty,bathroom,interior,modern'),
  BEDROOM: buildPool('empty,bedroom,interior,modern'),
  EXTERIOR: buildPool('building,exterior,architecture'),
  BALCONY: buildPool('balcony,view,architecture'),
  DINING: buildPool('empty,dining-room,interior,modern'),
};

export const BLOCKED_IMAGE_KEYWORDS = ['portrait', 'people', 'woman', 'man', 'model'];
