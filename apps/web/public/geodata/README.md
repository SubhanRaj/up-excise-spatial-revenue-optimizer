# GeoJSON Data

Place `up-districts.geojson` here.

**Source:** GADM or Datameet India GIS (UP district boundaries, simplified)
**Expected feature property:** `district` — district name matching `districts.name` in D1
**File size:** ~200–400 KB (simplified polygons, sufficient for choropleth)

The choropleth map (`/admin` page) fetches this file at runtime. If missing, the map loads without district boundaries.
