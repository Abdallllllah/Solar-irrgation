"""
preprocess_roads.py — Convert Sentinel-2 road shapefiles to web-ready GeoJSON
and compute distance-to-nearest-paved-road for every grid cell in Rwanda & Kenya.

Outputs:
  app/data/roads_rw.geojson  — Rwanda road lines for map overlay
  app/data/roads_ky.geojson  — Kenya road lines for map overlay
  app/data/road_distances.json — {cell_index: distance_km} for all RW/KE cells
"""
import shapefile
import json
import math
import os
import time

BASE = os.path.dirname(os.path.abspath(__file__))
ROAD_DIR = os.path.join(BASE, 'Road predictions')
DATA_DIR = os.path.join(BASE, 'app', 'data')

# Column indices matching utils.js COL
COL_LON = 0
COL_LAT = 1
COL_CI  = 29   # country index — LAST column

# ── Haversine distance (km) ──
def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.asin(math.sqrt(a))

# ── Step 1: Convert shapefile → GeoJSON ──
def shp_to_geojson(shp_path, output_path, label):
    print(f'\n[{label}] Reading {shp_path}...')
    sf = shapefile.Reader(shp_path)
    fields = [f[0] for f in sf.fields[1:]]
    
    features = []
    paved_vertices = []
    
    paved_count = 0
    unpaved_count = 0
    
    for shape, rec in zip(sf.shapes(), sf.records()):
        rec_dict = dict(zip(fields, rec))
        
        is_paved = str(rec_dict.get('predicted_', '')).strip().lower() == 'paved'
        highway = str(rec_dict.get('highway', '')).strip()
        length = float(rec_dict.get('Length', 0) or 0)
        first_paved = str(rec_dict.get('First_Pave', '')).strip()
        
        if is_paved:
            paved_count += 1
        else:
            unpaved_count += 1
        
        # Build geometry — round to 4 decimal places (~11m precision)
        if len(shape.parts) <= 1:
            coords = [[round(p[0], 4), round(p[1], 4)] for p in shape.points]
            geom = {"type": "LineString", "coordinates": coords}
        else:
            parts_idx = list(shape.parts) + [len(shape.points)]
            coords = []
            for j in range(len(shape.parts)):
                part = [[round(p[0], 4), round(p[1], 4)] for p in shape.points[parts_idx[j]:parts_idx[j+1]]]
                coords.append(part)
            geom = {"type": "MultiLineString", "coordinates": coords}
        
        # Collect paved road vertices for distance calculation (lat, lon)
        if is_paved:
            if geom["type"] == "LineString":
                for p in coords:
                    paved_vertices.append((p[1], p[0]))  # (lat, lon)
            else:
                for part in coords:
                    for p in part:
                        paved_vertices.append((p[1], p[0]))
        
        features.append({
            "type": "Feature",
            "geometry": geom,
            "properties": {
                "p": 1 if is_paved else 0,
                "h": highway,
                "l": round(length),
                "fp": first_paved
            }
        })
    
    geojson = {"type": "FeatureCollection", "features": features}
    
    with open(output_path, 'w') as f:
        json.dump(geojson, f, separators=(',', ':'))
    
    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f'  [{label}] {len(features):,} segments ({paved_count:,} paved, {unpaved_count:,} unpaved)')
    print(f'  [{label}] Written {output_path} ({size_mb:.1f} MB)')
    print(f'  [{label}] Collected {len(paved_vertices):,} paved road vertices')
    
    return paved_vertices

# ── Step 2: Compute distance-to-nearest-paved-road ──
def compute_distances(paved_vertices, cells, label):
    print(f'\n[{label}] Computing distances for {len(cells):,} cells against {len(paved_vertices):,} paved vertices...')
    
    if not paved_vertices or not cells:
        return {}
    
    # Spatial binning: group paved vertices into 0.1° bins for fast lookup
    bins = {}
    for lat, lon in paved_vertices:
        key = (round(lat * 10) / 10, round(lon * 10) / 10)
        if key not in bins:
            bins[key] = []
        bins[key].append((lat, lon))
    
    print(f'  [{label}] Created {len(bins)} spatial bins (0.1° resolution)')
    
    distances = {}
    t0 = time.time()
    
    for idx, (cell_idx, clat, clon) in enumerate(cells):
        min_dist = float('inf')
        
        # Search increasingly larger radii until we find something
        center_key = (round(clat * 10) / 10, round(clon * 10) / 10)
        
        for search_radius in [0.5, 1.0, 2.0, 5.0]:
            steps = int(search_radius * 10)
            for dlat_i in range(-steps, steps + 1):
                for dlon_i in range(-steps, steps + 1):
                    key = (center_key[0] + dlat_i * 0.1, center_key[1] + dlon_i * 0.1)
                    if key in bins:
                        for vlat, vlon in bins[key]:
                            d = haversine(clat, clon, vlat, vlon)
                            if d < min_dist:
                                min_dist = d
            if min_dist < search_radius * 111:  # found something within this radius
                break
        
        # Fallback: brute force (should be very rare)
        if min_dist == float('inf'):
            for vlat, vlon in paved_vertices[:10000]:  # sample
                d = haversine(clat, clon, vlat, vlon)
                if d < min_dist:
                    min_dist = d
        
        distances[cell_idx] = round(min_dist, 1)
        
        if (idx + 1) % 200 == 0:
            elapsed = time.time() - t0
            rate = (idx + 1) / elapsed
            remaining = (len(cells) - idx - 1) / rate
            print(f'  [{label}] {idx+1:,}/{len(cells):,} cells ({rate:.0f} cells/sec, ~{remaining:.0f}s remaining)')
    
    elapsed = time.time() - t0
    print(f'  [{label}] Done in {elapsed:.1f}s')
    
    dists = list(distances.values())
    if dists:
        print(f'  [{label}] Distance stats: min={min(dists):.1f}km, median={sorted(dists)[len(dists)//2]:.1f}km, max={max(dists):.1f}km')
    
    return distances


# ── Main ──
def main():
    print('=' * 60)
    print('ROAD PREPROCESSING')
    print('=' * 60)
    
    # Convert shapefiles to GeoJSON
    rw_vertices = shp_to_geojson(
        os.path.join(ROAD_DIR, 'roads_s2.shp'),
        os.path.join(DATA_DIR, 'roads_rw.geojson'),
        'Rwanda'
    )
    
    ky_vertices = shp_to_geojson(
        os.path.join(ROAD_DIR, 'roads_s2_ky.shp'),
        os.path.join(DATA_DIR, 'roads_ky.geojson'),
        'Kenya'
    )
    
    # Load grid cells
    print('\n[Grid] Loading cell grid from maize/fert100.json...')
    with open(os.path.join(DATA_DIR, 'maize', 'fert100.json'), 'r') as f:
        grid = json.load(f)
    
    country_names = grid['countries']
    cells = grid['data']
    print(f'[Grid] {len(cells):,} total cells, {len(country_names)} countries')
    print(f'[Grid] COL_CI={COL_CI}, COL_LON={COL_LON}, COL_LAT={COL_LAT}')
    
    # Find Rwanda and Kenya indices
    rw_idx = country_names.index('Rwanda') if 'Rwanda' in country_names else None
    ky_idx = country_names.index('Kenya') if 'Kenya' in country_names else None
    print(f'[Grid] Rwanda country index: {rw_idx}, Kenya country index: {ky_idx}')
    
    # Extract cells by country — ci is at index 29 (last column)
    rw_cells = []
    ky_cells = []
    for i, row in enumerate(cells):
        ci = int(row[COL_CI])
        if ci == rw_idx:
            rw_cells.append((i, row[COL_LAT], row[COL_LON]))
        elif ci == ky_idx:
            ky_cells.append((i, row[COL_LAT], row[COL_LON]))
    
    print(f'[Grid] Rwanda: {len(rw_cells):,} cells, Kenya: {len(ky_cells):,} cells')
    
    # Sanity check
    if rw_cells:
        print(f'  Rwanda sample: idx={rw_cells[0][0]}, lat={rw_cells[0][1]}, lon={rw_cells[0][2]}')
    if ky_cells:
        print(f'  Kenya sample: idx={ky_cells[0][0]}, lat={ky_cells[0][1]}, lon={ky_cells[0][2]}')
    
    # Compute distances
    rw_distances = compute_distances(rw_vertices, rw_cells, 'Rwanda')
    ky_distances = compute_distances(ky_vertices, ky_cells, 'Kenya')
    
    # Merge and save
    all_distances = {}
    all_distances.update({str(k): v for k, v in rw_distances.items()})
    all_distances.update({str(k): v for k, v in ky_distances.items()})
    
    out_path = os.path.join(DATA_DIR, 'road_distances.json')
    with open(out_path, 'w') as f:
        json.dump(all_distances, f, separators=(',', ':'))
    
    size_kb = os.path.getsize(out_path) / 1024
    print(f'\n[Output] Written road_distances.json ({size_kb:.1f} KB, {len(all_distances):,} cells)')
    print('\n' + '=' * 60)
    print('DONE!')
    print('=' * 60)


if __name__ == '__main__':
    main()
