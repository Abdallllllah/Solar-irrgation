"""
preprocess_admin.py — Assign each grid cell to an admin region (province/county)
using point-in-polygon tests with geoBoundaries ADM1 data.

Outputs:
  app/data/admin_rw.geojson  — Rwanda ADM1 boundaries for map overlay
  app/data/admin_ke.geojson  — Kenya ADM1 boundaries for map overlay
  app/data/admin_regions.json — {cell_index: "Region Name"} lookup
"""
import json
import os
import time
import shutil

BASE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE, 'app', 'data')

COL_LON = 0
COL_LAT = 1
COL_CI  = 29


def point_in_polygon(px, py, polygon):
    """Ray-casting algorithm for point-in-polygon test."""
    n = len(polygon)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def point_in_feature(lon, lat, feature):
    """Check if a point falls inside a GeoJSON feature (Polygon or MultiPolygon)."""
    geom = feature['geometry']
    if geom['type'] == 'Polygon':
        # First ring is exterior, rest are holes (ignore holes for simplicity)
        return point_in_polygon(lon, lat, geom['coordinates'][0])
    elif geom['type'] == 'MultiPolygon':
        for polygon in geom['coordinates']:
            if point_in_polygon(lon, lat, polygon[0]):
                return True
    return False


def assign_cells_to_regions(geojson, cells, label):
    """For each cell, find which admin region it falls in."""
    features = geojson['features']
    print(f'[{label}] Assigning {len(cells):,} cells to {len(features)} regions...')

    # Build bounding boxes for fast pre-filtering
    bboxes = []
    for ft in features:
        coords = []
        geom = ft['geometry']
        if geom['type'] == 'Polygon':
            coords = geom['coordinates'][0]
        elif geom['type'] == 'MultiPolygon':
            for poly in geom['coordinates']:
                coords.extend(poly[0])
        if coords:
            lons = [c[0] for c in coords]
            lats = [c[1] for c in coords]
            bboxes.append((min(lons), min(lats), max(lons), max(lats)))
        else:
            bboxes.append(None)

    assignments = {}
    unassigned = 0
    t0 = time.time()

    for idx, (cell_idx, clat, clon) in enumerate(cells):
        found = None
        for fi, ft in enumerate(features):
            bb = bboxes[fi]
            if bb is None:
                continue
            # Quick bbox check
            if clon < bb[0] or clon > bb[2] or clat < bb[1] or clat > bb[3]:
                continue
            if point_in_feature(clon, clat, ft):
                found = ft['properties']['shapeName']
                break

        if found:
            assignments[cell_idx] = found
        else:
            unassigned += 1

        if (idx + 1) % 500 == 0:
            elapsed = time.time() - t0
            rate = (idx + 1) / elapsed
            print(f'  [{label}] {idx+1:,}/{len(cells):,} ({rate:.0f} cells/sec)')

    elapsed = time.time() - t0
    print(f'  [{label}] Done in {elapsed:.1f}s. Assigned: {len(assignments):,}, Unassigned: {unassigned}')

    # Summary
    from collections import Counter
    counts = Counter(assignments.values())
    for name, count in sorted(counts.items(), key=lambda x: -x[1]):
        print(f'    {name}: {count} cells')

    return assignments


def main():
    print('=' * 60)
    print('ADMIN BOUNDARY PREPROCESSING')
    print('=' * 60)

    # Copy simplified GeoJSON to app/data/
    rw_src = os.path.join(BASE, 'geoBoundaries-RWA-ADM1_simplified.geojson')
    ke_src = os.path.join(BASE, 'geoBoundaries-KEN-ADM1_simplified.geojson')
    rw_dst = os.path.join(DATA_DIR, 'admin_rw.geojson')
    ke_dst = os.path.join(DATA_DIR, 'admin_ke.geojson')

    shutil.copy2(rw_src, rw_dst)
    shutil.copy2(ke_src, ke_dst)
    print(f'Copied Rwanda ADM1 -> {rw_dst} ({os.path.getsize(rw_dst) / 1024:.0f} KB)')
    print(f'Copied Kenya ADM1 -> {ke_dst} ({os.path.getsize(ke_dst) / 1024:.0f} KB)')

    # Load boundaries
    with open(rw_src) as f:
        rw_geo = json.load(f)
    with open(ke_src) as f:
        ke_geo = json.load(f)

    # Load grid cells
    print('\nLoading cell grid...')
    with open(os.path.join(DATA_DIR, 'maize', 'fert100.json')) as f:
        grid = json.load(f)

    country_names = grid['countries']
    cells = grid['data']
    rw_idx = country_names.index('Rwanda') if 'Rwanda' in country_names else None
    ky_idx = country_names.index('Kenya') if 'Kenya' in country_names else None
    print(f'Rwanda ci={rw_idx}, Kenya ci={ky_idx}')

    rw_cells = [(i, cells[i][COL_LAT], cells[i][COL_LON]) for i in range(len(cells)) if int(cells[i][COL_CI]) == rw_idx] if rw_idx is not None else []
    ke_cells = [(i, cells[i][COL_LAT], cells[i][COL_LON]) for i in range(len(cells)) if int(cells[i][COL_CI]) == ky_idx] if ky_idx is not None else []
    print(f'Rwanda: {len(rw_cells):,} cells, Kenya: {len(ke_cells):,} cells')

    # Assign cells to admin regions
    rw_assignments = assign_cells_to_regions(rw_geo, rw_cells, 'Rwanda')
    ke_assignments = assign_cells_to_regions(ke_geo, ke_cells, 'Kenya')

    # Merge and save
    all_regions = {}
    all_regions.update({str(k): v for k, v in rw_assignments.items()})
    all_regions.update({str(k): v for k, v in ke_assignments.items()})

    out_path = os.path.join(DATA_DIR, 'admin_regions.json')
    with open(out_path, 'w') as f:
        json.dump(all_regions, f, separators=(',', ':'))

    print(f'\nWritten admin_regions.json ({os.path.getsize(out_path) / 1024:.1f} KB, {len(all_regions):,} cells)')
    print('\n' + '=' * 60)
    print('DONE!')
    print('=' * 60)


if __name__ == '__main__':
    main()
