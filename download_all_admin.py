"""
download_all_admin.py — Download ADM1 simplified GeoJSON boundaries for all 40 SSA countries
from geoBoundaries API, and run point-in-polygon assignment for all 132,439 grid cells.

Outputs:
  app/data/admin/<ISO3>.geojson — ADM1 boundaries per country
  app/data/admin_regions.json   — {cell_index: "Region Name"} lookup for all 40 countries
"""
import json
import urllib.request
import os
import time

BASE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE, 'app', 'data')
ADMIN_DIR = os.path.join(DATA_DIR, 'admin')
os.makedirs(ADMIN_DIR, exist_ok=True)

# 40 Countries in dataset mapped to ISO3
COUNTRY_ISO = {
    'Zimbabwe': 'ZWE', 'Botswana': 'BWA', 'Namibia': 'NAM', 'Mozambique': 'MOZ',
    'Zambia': 'ZMB', 'Malawi': 'MWI', 'South Africa': 'ZAF', 'Angola': 'AGO',
    'Lesotho': 'LSO', 'Swaziland': 'SWZ', 'Nigeria': 'NGA', 'Ivory Coast': 'CIV',
    'Benin': 'BEN', 'Ghana': 'GHA', 'Togo': 'TGO', 'Niger': 'NER',
    'Mali': 'MLI', 'Senegal': 'SEN', 'Burkina Faso': 'BFA', 'Liberia': 'LBR',
    'Gambia': 'GMB', 'Guinea-Bissau': 'GNB', 'Guinea': 'GIN', 'Central African Republic': 'CAF',
    'Chad': 'TCD', 'Cameroon': 'CMR', 'Congo': 'COG', 'Gabon': 'GAB',
    'DRC': 'COD', 'Tanzania': 'TZA', 'South Sudan': 'SSD', 'Sudan': 'SDN',
    'SierraLeone': 'SLE', 'Burundi': 'BDI', 'Rwanda': 'RWA', 'Somalia': 'SOM',
    'Eritrea': 'ERI', 'Ethiopia': 'ETH', 'Uganda': 'UGA', 'Kenya': 'KEN'
}

COL_LON = 0
COL_LAT = 1
COL_CI  = 29


def download_boundary(country_name, iso3):
    out_file = os.path.join(ADMIN_DIR, f'{iso3}.geojson')
    
    # Check local copies first (Rwanda & Kenya already exist in root workspace)
    if country_name == 'Rwanda':
        rw_src = os.path.join(BASE, 'geoBoundaries-RWA-ADM1_simplified.geojson')
        if os.path.exists(rw_src):
            import shutil
            shutil.copy2(rw_src, out_file)
            print(f'[{country_name}] Used local file -> {out_file}')
            return out_file
    elif country_name == 'Kenya':
        ke_src = os.path.join(BASE, 'geoBoundaries-KEN-ADM1_simplified.geojson')
        if os.path.exists(ke_src):
            import shutil
            shutil.copy2(ke_src, out_file)
            print(f'[{country_name}] Used local file -> {out_file}')
            return out_file
            
    if os.path.exists(out_file) and os.path.getsize(out_file) > 1000:
        print(f'[{country_name}] Already downloaded: {iso3}.geojson ({os.path.getsize(out_file)/1024:.0f} KB)')
        return out_file
        
    api_url = f'https://www.geoboundaries.org/api/current/gbOpen/{iso3}/ADM1/'
    try:
        req = urllib.request.Request(api_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as resp:
            meta = json.loads(resp.read().decode('utf-8'))
            
        dl_url = meta.get('simplifiedGeometryGeoJSON') or meta.get('gjDownloadURL')
        if not dl_url:
            print(f'[{country_name}] No download URL found in API metadata')
            return None
            
        print(f'[{country_name}] Downloading from {dl_url}...')
        req_dl = urllib.request.Request(dl_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req_dl, timeout=30) as resp_dl:
            content = resp_dl.read()
            with open(out_file, 'wb') as f:
                f.write(content)
        print(f'[{country_name}] Saved {out_file} ({len(content)/1024:.0f} KB)')
        return out_file
    except Exception as e:
        print(f'[{country_name}] Failed to download ({iso3}): {e}')
        return None


def point_in_polygon(px, py, polygon):
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
    geom = feature['geometry']
    if geom['type'] == 'Polygon':
        return point_in_polygon(lon, lat, geom['coordinates'][0])
    elif geom['type'] == 'MultiPolygon':
        for polygon in geom['coordinates']:
            if point_in_polygon(lon, lat, polygon[0]):
                return True
    return False


def assign_cells_for_country(geojson, cells, country_name):
    features = geojson.get('features', [])
    if not features:
        return {}
        
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
    for cell_idx, clat, clon in cells:
        for fi, ft in enumerate(features):
            bb = bboxes[fi]
            if bb is None:
                continue
            if clon < bb[0] or clon > bb[2] or clat < bb[1] or clat > bb[3]:
                continue
            if point_in_feature(clon, clat, ft):
                name = ft['properties'].get('shapeName') or ft['properties'].get('name') or 'Unknown'
                assignments[cell_idx] = name
                break
    return assignments


def main():
    print('=' * 60)
    print('ALL 40 COUNTRIES ADMIN BOUNDARY PREPROCESSING')
    print('=' * 60)
    
    # 1. Download GeoJSON for all 40 countries
    downloaded_paths = {}
    for country, iso3 in COUNTRY_ISO.items():
        p = download_boundary(country, iso3)
        if p:
            downloaded_paths[country] = p
        time.sleep(0.2)
        
    print(f'\nSuccessfully retrieved boundary files for {len(downloaded_paths)}/{len(COUNTRY_ISO)} countries.')

    # 2. Load cell grid
    print('\nLoading cell grid...')
    with open(os.path.join(DATA_DIR, 'maize', 'fert100.json')) as f:
        grid = json.load(f)

    country_names = grid['countries']
    cells = grid['data']
    print(f'Loaded {len(cells):,} cells across {len(country_names)} countries.')

    # Group cell indices by country
    cells_by_country = {}
    for i, row in enumerate(cells):
        ci = int(row[COL_CI])
        cname = country_names[ci] if ci < len(country_names) else None
        if cname:
            if cname not in cells_by_country:
                cells_by_country[cname] = []
            cells_by_country[cname].append((i, row[COL_LAT], row[COL_LON]))

    # 3. Assign cells for each country
    print('\nAssigning grid cells to admin regions for all countries...')
    all_assignments = {}
    t0 = time.time()
    
    for country, ccells in cells_by_country.items():
        if country not in downloaded_paths:
            print(f'  [{country}] Skipping (no boundary file)')
            continue
            
        with open(downloaded_paths[country]) as f:
            geojson = json.load(f)
            
        assigned = assign_cells_for_country(geojson, ccells, country)
        all_assignments.update({str(k): v for k, v in assigned.items()})
        print(f'  [{country}] {len(assigned):,}/{len(ccells):,} cells assigned to {len(geojson.get("features", []))} regions')

    elapsed = time.time() - t0
    print(f'\nSpatial indexing finished in {elapsed:.1f}s.')

    # 4. Save merged admin_regions.json
    out_path = os.path.join(DATA_DIR, 'admin_regions.json')
    with open(out_path, 'w') as f:
        json.dump(all_assignments, f, separators=(',', ':'))

    print(f'Written admin_regions.json ({os.path.getsize(out_path)/1024:.1f} KB, {len(all_assignments):,} cells)')
    print('=' * 60)
    print('DONE!')
    print('=' * 60)


if __name__ == '__main__':
    main()
