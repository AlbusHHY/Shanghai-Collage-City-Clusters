# Shanghai Collage City Clusters

This folder contains an interactive Mapbox GL / Leaflet fallback map of **5,956 land-parcel polygons** within the Shanghai Inner Ring. The source dataset is `上海内环地块簇群分类与一致性熵.shp`; the original files were not modified.

Mapbox mode provides separate **2D Buildings** and **3D Buildings** switches. The 2D layer renders every building feature available from Mapbox Streets at the current zoom, while the 3D switch uses the native Mapbox Standard building presentation. In Leaflet fallback mode, only the local 2D layer derived from `上海3D建筑.shp` is available.

Scale-specific cluster outlines are derived from `簇群描边/S1_BOUNDARY.shp` through `S5_BOUNDARY.shp`. They are transformed from EPSG:3857 to EPSG:4326 and rendered as unfilled black boundaries above the parcel layer. Boundary counts for Scales 1–5 are 85, 130, 192, 344, and 1,126 respectively. The active boundary layer changes immediately with the scale control.

## Data and field mapping

- Source CRS: WGS 1984 Web Mercator Auxiliary Sphere (EPSG:3857)
- Web output CRS: WGS 84 (EPSG:4326)
- Geometry: Polygon / MultiPolygon
- Scale 1: `community_` → `cluster_scale_1`; `H_shannon` → `entropy_scale_1`
- Scale 2: `community1` → `cluster_scale_2`; `H_shanno_1` → `entropy_scale_2`
- Scale 3: `communit_1` → `cluster_scale_3`; `H_shanno_2` → `entropy_scale_3`
- Scale 4: `communit_2` → `cluster_scale_4`; `H_shanno_3` → `entropy_scale_4`
- Scale 5: `communit_3` → `cluster_scale_5`; `H_shanno_4` → `entropy_scale_5`

The Scale 3–5 cluster field names are truncated in the shapefile (`communit_1`, `communit_2`, `communit_3`). Only the ten mapped research attributes are exported. Geometry is stored once per feature. No geometry simplification was applied. Full schema, unique values, missing counts, and entropy statistics are in `data/inspection_summary.json`.

Raw `CT` values are translated in the interface to the supplied cross-scale urban-form taxonomy (01–15). Legends display only types present at the active scale; the stable selected-cluster information panel displays the mapped urban-form type.

When a Mapbox public access token is configured, the platform uses **Mapbox GL JS 3.30.0**, the Mapbox Standard `monochrome` theme, and Mapbox-hosted 3D buildings. The local building MVT files are not requested in this mode. The former Leaflet + local MVT implementation remains as an automatic fallback when no valid Mapbox token is configured or the Mapbox library cannot be loaded. See `MAPBOX_API设置说明.md` and edit `js/mapbox_config.js` to enable Mapbox.

For safety, the repository contains only a blank public Mapbox configuration. The existing secret token is preserved locally in the Git-ignored `js/mapbox_config.private.js`; the bundled local server serves that private file automatically. Public hosting must use a domain-restricted Mapbox public token beginning with `pk.`. Never place a Mapbox secret token beginning with `sk.` in client-side code or a public repository.

## Open the map

Open the map through the included local HTTP server by double-clicking `start_map.bat`. The script selects an available local port and opens the map in the default browser. Keep the server window open while using the map.

Internet access is required for the Mapbox basemap and 3D buildings. In fallback mode, it is required for Leaflet 1.9.4, Leaflet.VectorGrid 1.3.0, and the CARTO Positron basemap. The research parcel, boundary, and membership data remain local.

## Anonymous participatory voting

The voting system stores only aggregate counts for each scale and cluster. It does not store visitor IDs, IP addresses, user agents, cookies, or individual ballots. A vote can be revised while the current page remains open; reloading the page begins a new anonymous response.

The 235 responses collected before publication are preserved as aggregate totals in `data/votes.json` and `data/vote_totals_seed.json`. The original row-level file is kept only as the local, Git-ignored `data/votes.private.json` and must never be uploaded.

Local mode uses `start_map.bat` and the aggregate JSON store. Public mode uses the API URL in `js/vote_config.js` and the Sites D1 implementation built from `worker/src/index.js`. The D1 database contains one aggregate row per scale/cluster and therefore cannot expose or reconstruct an individual visitor's response.

## GitHub Pages and vote API deployment

The included GitHub Actions workflow publishes the repository root to GitHub Pages whenever `main` is updated. The shared vote API is deployed separately with Sites and D1; `js/vote_config.js` already points to it. The schema source is `db/schema.ts`, generated migrations are in `drizzle/`, and `npm run build` packages the server entrypoint plus the anonymous 235-vote aggregate seed. The seed endpoint inserts those totals only when the database is empty.

The alternative standalone Cloudflare Worker configuration remains under `worker/` for maintainers who prefer to deploy directly with Wrangler.
