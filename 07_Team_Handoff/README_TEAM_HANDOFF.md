# MarsPath — Team Handoff / Data Manifest

## Source folder on the GIS computer
`D:\videos\Orbit Guardians\MarsPath\`

Copy this handoff into:
`D:\videos\Orbit Guardians\MarsPath\04_Team_Handoff\`

## Minimum dataset for Sajeesan (backend)
- `01_rover_navigation/jezero_candidates.csv`: 3 site IDs JEZERO_A/B/C, longitude, latitude, slope, elevation, terrain metrics.
- `01_rover_navigation/jezero_candidate_zones.geojson`: three original-resolution Jezero navigation-class-1 terrain polygons, not simplified.
- `02_water_ice/arcadia_ice_candidates.csv`: 3 site IDs ARCADIA_A/B/C, representative points, surface area approximations, two SWIM depth metrics and experimental composite.
- `02_water_ice/arcadia_ice_zones_mars_latlon.geojson`: three Arcadia polygons, converted from metre-based Mars CRS without geometry simplification.
- `03_past_life/jezero_past_life_locations.csv`: three Perseverance sample locations, descriptions, source and coordinate-status metadata.
- `03_past_life/jezero_past_life_sites.geojson`: three Jezero sample marker points.

## Minimum dataset for Shamla (frontend)
Prefer consuming Sajeesan's backend API for these same six files. No need to duplicate raster files in frontend. Show science descriptions, depth-interval names and uncertainties; load original polygons on a Mars-specific geographic viewer. Do not render these with an Earth basemap.

## Planetary coordinate conventions
All CSV point positions and the GeoJSON in this handoff are `[longitude_east_degrees, latitude_north_degrees]` based on a Mars sphere of radius 3396190 metres, not WGS84 Earth, despite GeoJSON's conventional Earth-based interpretation. The original Arcadia GeoJSON on the GIS machine (`03_processed_Data/Water_Ice/arcadia_ice_zones.geojson`) is in Mars projected metres (ESRI:103885), and should **not** be used as if it contained longitude and latitude. A corrected copy is included here.

## Scientific limitations
- Rover navigation: `DN=1` is the team's low-cost class, not a certified safe landing region. Check original navigation-cost derivation and route feasibility before making rover safety claims.
- Ice: SWIM4MIM native pixel size about 2963.735 m. `ice_mean` averages 0-1 m and 1-5 m ice consistency, selected at threshold >=0.5 and at least 20 valid cells; it is a prototype score, not an ice probability or confirmed ice.
- Past-life: science targets are selected Perseverance sample points, not whole geological unit boundaries; a potential biosignature is not proven life. Inspect `coordinate_status`, especially LIFE_002 and LIFE_003, pending primary-source coordinate verification.
- Mars area: Arcadia `area_km2` is map-projected, whereas `surface_km2` is approximate cosine-adjusted area; neither is a precise rover-scale drilling footprint.

## Optional raster/terrain inputs for backend route computation
The CSV/GeoJSON alone do not support calculation of new rover routes. If backend will compute routes, also copy *from the local GIS computer*:
- `03_processed_Data/Navigation/landing_area_navigation_cost_2km.tif`
- `03_processed_Data/Terrain/landing_area_slope_degrees.tif`
- `03_processed_Data/Terrain/landing_area_dem_1m.tif`
- `03_processed_Data/Terrain/landing_area_ortho_fixed.tif` (display overlay if needed)
- `03_processed_Data/Water_Ice/arcadia_ice_composite.tif` (evidence raster, optional for map)
- `03_processed_Data/Water_Ice/arcadia_swim_0_1m.tif`, `arcadia_swim_1_5m.tif` (source depth layers, optional)

These GIS rasters are *not* included in this archive; retrieve them from the original MarsPath local data folders. Keep original NASA data and QGIS projects in the GIS team's master archive.
