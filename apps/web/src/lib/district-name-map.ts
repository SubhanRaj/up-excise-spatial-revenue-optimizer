/**
 * Maps GeoJSON property district names to canonical system district names.
 * Populated when mismatches are found between the GeoJSON source and districts.name.
 * Add entries here; the choropleth will resolve them automatically.
 */
export const DISTRICT_NAME_MAP: Record<string, string> = {
  // 'GeoJSON Name': 'System Canonical Name'
  'Kanpur': 'Kanpur Nagar',
  'Sant Kabir Nagar': 'Sant Kabeer Nagar',
  // Add more as needed during GeoJSON integration
};

export function resolveDistrictName(geoJsonName: string): string {
  return DISTRICT_NAME_MAP[geoJsonName] ?? geoJsonName;
}
