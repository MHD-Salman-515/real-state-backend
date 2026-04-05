export type ComparableScoringInput = {
  targetDistrict?: string;
  targetArea: number;
  targetBedrooms?: number;
  targetPropertyType: string;
  comparableDistrict?: string | null;
  comparableArea?: number | null;
  comparableBedrooms?: number | null;
  comparablePropertyType?: string | null;
};

export type ComparableScoringBreakdown = {
  district_match: number;
  area_similarity: number;
  bedroom_similarity: number;
  property_type_match: number;
  similarity_score: number;
};

export function computeSimilarityScore(
  input: ComparableScoringInput,
): ComparableScoringBreakdown {
  const districtMatch =
    input.targetDistrict &&
    input.comparableDistrict &&
    input.targetDistrict === input.comparableDistrict
      ? 1
      : 0;

  const propertyTypeMatch =
    input.comparablePropertyType === input.targetPropertyType ? 1 : 0;

  const comparableArea =
    typeof input.comparableArea === 'number' && input.comparableArea > 0
      ? input.comparableArea
      : null;
  const areaSimilarity =
    comparableArea == null
      ? 0
      : Math.max(
          0,
          1 -
            Math.abs(input.targetArea - comparableArea) /
              Math.max(input.targetArea, comparableArea),
        );

  let bedroomSimilarity = 0;
  if (
    typeof input.targetBedrooms === 'number' &&
    Number.isInteger(input.targetBedrooms) &&
    input.targetBedrooms >= 0 &&
    typeof input.comparableBedrooms === 'number' &&
    Number.isInteger(input.comparableBedrooms) &&
    input.comparableBedrooms >= 0
  ) {
    const difference = Math.abs(input.targetBedrooms - input.comparableBedrooms);
    if (difference === 0) {
      bedroomSimilarity = 1;
    } else if (difference === 1) {
      bedroomSimilarity = 0.5;
    }
  }

  const similarityScore =
    districtMatch * 0.4 +
    areaSimilarity * 0.3 +
    bedroomSimilarity * 0.2 +
    propertyTypeMatch * 0.1;

  return {
    district_match: districtMatch,
    area_similarity: Number(areaSimilarity.toFixed(6)),
    bedroom_similarity: bedroomSimilarity,
    property_type_match: propertyTypeMatch,
    similarity_score: Number(similarityScore.toFixed(6)),
  };
}

export function computeMedian(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}
