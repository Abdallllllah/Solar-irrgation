"""
Preprocessing v3: Multi-crop support.
Usage: python preprocess.py <crop_name>
Example: python preprocess.py maize
         python preprocess.py cassava
If no crop name given, defaults to 'maize'.
Outputs to app/data/<crop_name>/
"""
import csv
import json
import os
import math
import time
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
AVAILABLE_CROPS = ['maize', 'cassava', 'onion', 'potato', 'sorghum', 'tomato', 'wheat']

# Get crop name from CLI argument
if len(sys.argv) > 1:
    CROP_NAME = sys.argv[1].lower()
else:
    CROP_NAME = 'maize'

if CROP_NAME == 'all':
    # Will be handled by running this script 7 times
    print('To process all crops, run: for crop in maize cassava onion potato sorghum tomato wheat; do python preprocess.py $crop; done')
    sys.exit(0)

if CROP_NAME not in AVAILABLE_CROPS:
    print(f'Error: Unknown crop "{CROP_NAME}". Available: {AVAILABLE_CROPS}')
    sys.exit(1)

INPUT_FILE = os.path.join(BASE_DIR, f'{CROP_NAME}_crop_data.csv')
OUTPUT_DIR = os.path.join(BASE_DIR, 'app', 'data', CROP_NAME)
os.makedirs(OUTPUT_DIR, exist_ok=True)

YEARS = list(range(2001, 2020))
FERT_LEVELS = ['FERT100', 'FERT85', 'FERT50', 'FERT25']

def safe_float(v):
    try:
        f = float(v)
        return None if math.isinf(f) else f
    except:
        return None

def temporal_stats(raw_vals):
    """Compute (mean, sd, min, max) from a list that may contain None."""
    clean = [v for v in raw_vals if v is not None]
    if not clean:
        return (0, 0, 0, 0)
    n = len(clean)
    mean_val = sum(clean) / n
    if n > 1:
        variance = sum((x - mean_val) ** 2 for x in clean) / (n - 1)
        sd_val = math.sqrt(variance)
    else:
        sd_val = 0
    return (
        round(mean_val, 2),
        round(sd_val, 2),
        round(min(clean), 2),
        round(max(clean), 2)
    )

print("=" * 50)
print(f"PREPROCESSING v3 — {CROP_NAME.upper()}")
print("=" * 50)
print(f"Input: {INPUT_FILE}")
print(f"Output: {OUTPUT_DIR}")
start = time.time()

country_set = {}
data_by_fert = {f: [] for f in FERT_LEVELS}
country_list = []

print("Reading CSV...")
with open(INPUT_FILE, 'r') as f:
    reader = csv.DictReader(f)
    for i, row in enumerate(reader):
        country = row['Country']
        if country not in country_set:
            country_set[country] = {
                'name': country, 'region': row['Region'],
                'idx': len(country_set), 'cells': 0,
                'lon_min': 999, 'lon_max': -999,
                'lat_min': 999, 'lat_max': -999
            }
            country_list.append(country)

        ci = country_set[country]
        lon = round(float(row['LON']), 3)
        lat = round(float(row['LAT']), 3)
        ci['lon_min'] = min(ci['lon_min'], lon)
        ci['lon_max'] = max(ci['lon_max'], lon)
        ci['lat_min'] = min(ci['lat_min'], lat)
        ci['lat_max'] = max(ci['lat_max'], lat)

        fert = row['FERT']
        if fert == 'FERT100':
            ci['cells'] += 1

        # Temporal stats for each time-varying metric
        irr_raw = [safe_float(row.get(f'irr_{y}')) for y in YEARS]
        kwh_min_raw = [safe_float(row.get(f'kwh.min_{y}')) for y in YEARS]
        kwh_max_raw = [safe_float(row.get(f'kwh.max_{y}')) for y in YEARS]
        dy_raw = [safe_float(row.get(f'delta_yield_{y}')) for y in YEARS]

        irr_mean, irr_sd, irr_lo, irr_hi = temporal_stats(irr_raw)
        kwh_min_mean, kwh_min_sd, kwh_min_lo, kwh_min_hi = temporal_stats(kwh_min_raw)
        kwh_max_mean, kwh_max_sd, kwh_max_lo, kwh_max_hi = temporal_stats(kwh_max_raw)
        dy_mean, dy_sd, dy_lo, dy_hi = temporal_stats(dy_raw)

        pr_min = safe_float(row['Crop_price_min'])
        pr_max = safe_float(row['Crop_price_max'])
        viable = 1 if (pr_min is not None and pr_max is not None) else 0

        # 30 columns per cell
        cell = [
            lon, lat,
            round(float(row['cropland']), 1),
            int(float(row['DTW_min'])),
            int(float(row['DTW_max'])),
            round(float(row['Elevation']), 0),
            round(float(row['srad_mean']), 2),
            round(float(row.get('PV_size(kWp)', '0')), 2),
            # Groundwater productivity (L/s)
            round(float(row['GWP_min']), 1),
            round(float(row['GWP_max']), 1),
            # Irrigation: mean, sd, min, max
            irr_mean, irr_sd, irr_lo, irr_hi,
            # Energy min: mean, sd, min, max
            kwh_min_mean, kwh_min_sd, kwh_min_lo, kwh_min_hi,
            # Energy max: mean, sd, min, max
            kwh_max_mean, kwh_max_sd, kwh_max_lo, kwh_max_hi,
            # Yield gain: mean, sd, min, max
            dy_mean, dy_sd, dy_lo, dy_hi,
            # Economic
            round(pr_min, 0) if pr_min else None,
            round(pr_max, 0) if pr_max else None,
            viable,
            ci['idx']
        ]
        data_by_fert[fert].append(cell)

        if (i + 1) % 100000 == 0:
            print(f"  ...processed {i+1:,} rows")

elapsed = time.time() - start
print(f"  Done reading: {i+1:,} rows in {elapsed:.1f}s")

# Column definitions — 30 columns
COLUMNS = [
    "lon", "lat", "cropland", "dtw_min", "dtw_max", "elev", "srad", "pv_kw",
    "gwp_min", "gwp_max",
    "irr", "irr_sd", "irr_lo", "irr_hi",
    "kwh_min", "kwh_min_sd", "kwh_min_lo", "kwh_min_hi",
    "kwh_max", "kwh_max_sd", "kwh_max_lo", "kwh_max_hi",
    "dy", "dy_sd", "dy_lo", "dy_hi",
    "pr_min", "pr_max", "viable", "ci"
]

# Write per-FERT data files
for fert in FERT_LEVELS:
    fname = os.path.join(OUTPUT_DIR, f'{fert.lower()}.json')
    output = {
        "crop": CROP_NAME,
        "fert": fert,
        "columns": COLUMNS,
        "countries": country_list,
        "data": data_by_fert[fert]
    }
    with open(fname, 'w') as f:
        json.dump(output, f, separators=(',', ':'))
    size_mb = os.path.getsize(fname) / (1024 * 1024)
    print(f"  Written {fert.lower()}.json ({size_mb:.1f} MB, {len(data_by_fert[fert]):,} cells)")

# Compute dynamic domain for yield gain based on actual data
all_dy = []
for fert in FERT_LEVELS:
    for row in data_by_fert[fert]:
        dy_val = row[COLUMNS.index('dy')]
        if dy_val is not None:
            all_dy.append(dy_val)
dy_max_rounded = math.ceil(max(all_dy)) if all_dy else 8

# Write index.json with updated metric configs
index = {
    "crop": CROP_NAME,
    "fert_levels": FERT_LEVELS,
    "columns": COLUMNS,
    "column_labels": {
        "lon": "Longitude", "lat": "Latitude",
        "cropland": "Cropland (ha)",
        "dtw_min": "Depth to Water - Deep Estimate (m)",
        "dtw_max": "Depth to Water - Shallow Estimate (m)",
        "elev": "Elevation (m)",
        "srad": "Solar Irradiation (kWh/m²/day)", "pv_kw": "PV Size (kWp/ha)",
        "gwp_min": "GW Productivity - Low (L/s)", "gwp_max": "GW Productivity - High (L/s)",
        "irr": "Irrigation Water Req. (m³/ha/yr)",
        "irr_sd": "Irrigation Water Req. SD", "irr_lo": "Irrigation Water Req. Min", "irr_hi": "Irrigation Water Req. Max",
        "kwh_min": "Energy Req. Min (kWh/ha/yr)",
        "kwh_min_sd": "Energy Req. Min SD", "kwh_min_lo": "Energy Req. Min - Lowest", "kwh_min_hi": "Energy Req. Min - Highest",
        "kwh_max": "Energy Req. Max (kWh/ha/yr)",
        "kwh_max_sd": "Energy Req. Max SD", "kwh_max_lo": "Energy Req. Max - Lowest", "kwh_max_hi": "Energy Req. Max - Highest",
        "dy": "Yield Gain (ton/ha)",
        "dy_sd": "Yield Gain SD", "dy_lo": "Yield Gain Min", "dy_hi": "Yield Gain Max",
        "pr_min": "Break-even Price Min (USD/ton)", "pr_max": "Break-even Price Max (USD/ton)",
        "viable": "Economically Viable", "ci": "Country Index"
    },
    "temporal_metrics": {
        "dy":      {"base": "dy", "sd": "dy_sd", "lo": "dy_lo", "hi": "dy_hi"},
        "irr":     {"base": "irr", "sd": "irr_sd", "lo": "irr_lo", "hi": "irr_hi"},
        "kwh_min": {"base": "kwh_min", "sd": "kwh_min_sd", "lo": "kwh_min_lo", "hi": "kwh_min_hi"},
        "kwh_max": {"base": "kwh_max", "sd": "kwh_max_sd", "lo": "kwh_max_lo", "hi": "kwh_max_hi"}
    },
    "metric_configs": {
        "irr":     {"label": "Irrigation Water Req.", "unit": "m³/ha/yr", "palette": "blues",   "domain": [0, 800],  "temporal": True},
        "kwh_min": {"label": "Energy Requirement (Min)", "unit": "kWh/ha/yr", "palette": "oranges", "domain": [0, 3000], "temporal": True},
        "kwh_max": {"label": "Energy Requirement (Max)", "unit": "kWh/ha/yr", "palette": "oranges", "domain": [0, 5000], "temporal": True},
        "dy":      {"label": "Irrigation Yield Gain", "unit": "ton/ha",   "palette": "greens",  "domain": [0, dy_max_rounded],    "temporal": True},
        "pr_min":  {"label": "Break-even Price (Min)", "unit": "USD/ton",  "palette": "viability","domain": [50, 500], "temporal": False},
        "pr_max":  {"label": "Break-even Price (Max)", "unit": "USD/ton",  "palette": "viability","domain": [50, 800], "temporal": False},
        "srad":    {"label": "Solar Irradiation",    "unit": "kWh/m²/day","palette": "solar",   "domain": [3, 7],    "temporal": False},
        "cropland":{"label": "Cropland Area",         "unit": "ha",        "palette": "greens",  "domain": [0, 9000], "temporal": False},
        "elev":    {"label": "Elevation",             "unit": "m",         "palette": "terrain", "domain": [0, 3000], "temporal": False},
        "dtw_min": {"label": "Depth to Groundwater",  "unit": "m",         "palette": "depth",   "domain": [0, 500],  "temporal": False},
        "gwp_max": {"label": "GW Productivity",       "unit": "L/s",       "palette": "blues",   "domain": [0, 20],   "temporal": False},
        "pv_kw":   {"label": "PV System Size",        "unit": "kWp/ha",    "palette": "solar",   "domain": [0, 4],    "temporal": False}
    },
    "countries": sorted([{
        'name': ci['name'], 'region': ci['region'], 'cells': ci['cells'],
        'bounds': [[ci['lon_min'], ci['lat_min']], [ci['lon_max'], ci['lat_max']]]
    } for ci in country_set.values()], key=lambda x: x['name'])
}

with open(os.path.join(OUTPUT_DIR, 'index.json'), 'w') as f:
    json.dump(index, f, indent=2)

total_time = time.time() - start
print(f"\n{'=' * 50}")
print(f"DONE in {total_time:.1f}s")
print(f"  {len(country_set)} countries, {len(data_by_fert['FERT100']):,} cells/FERT")
print(f"  Columns: {len(COLUMNS)} (30 cols: 16 base + 12 temporal + 2 GWP)")
print(f"  Output: {OUTPUT_DIR}")
print(f"{'=' * 50}")
