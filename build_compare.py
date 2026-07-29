"""
Build compare.json — compact cross-crop comparison data for the Click-to-Compare panel.
Reads all 7 crops' FERT100 data and extracts key metrics per cell.
Output: app/data/compare.json (~5MB)
"""
import json
import os

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, 'app', 'data')
CROPS = ['maize', 'cassava', 'onion', 'potato', 'sorghum', 'tomato', 'wheat']
CROP_LABELS = {
    'maize': '🌽 Maize', 'cassava': '🫘 Cassava', 'onion': '🧅 Onion',
    'potato': '🥔 Potato', 'sorghum': '🌿 Sorghum', 'tomato': '🍅 Tomato', 'wheat': '🌾 Wheat'
}

# Column indices from utils.js
COL_DY = 22      # yield gain mean
COL_PR_MIN = 26  # break-even price min
COL_IRR = 10     # irrigation water req mean
COL_LON = 0
COL_LAT = 1

print("Building compare.json...")

# Load all 7 crops' FERT100 data
crop_data = {}
for crop in CROPS:
    fpath = os.path.join(DATA, crop, 'fert100.json')
    with open(fpath, 'r') as f:
        d = json.load(f)
    crop_data[crop] = d['data']
    print(f"  Loaded {crop}: {len(d['data']):,} cells")

n_cells = len(crop_data['maize'])

# For each cell, extract [dy, pr_min, irr] per crop = 21 values per cell
# Format: data[cell_idx] = [dy_maize, dy_cassava, ..., pr_maize, pr_cassava, ..., irr_maize, irr_cassava, ...]
compare_data = []
for i in range(n_cells):
    row = []
    # Yield gains (7 values)
    for crop in CROPS:
        v = crop_data[crop][i][COL_DY]
        row.append(round(v, 2) if v is not None else None)
    # Break-even prices (7 values)
    for crop in CROPS:
        v = crop_data[crop][i][COL_PR_MIN]
        row.append(round(v, 1) if v is not None else None)
    # Water requirements (7 values)
    for crop in CROPS:
        v = crop_data[crop][i][COL_IRR]
        row.append(round(v, 0) if v is not None else None)
    compare_data.append(row)

output = {
    "crops": CROPS,
    "labels": CROP_LABELS,
    "metrics": ["dy", "pr_min", "irr"],
    "metric_labels": {"dy": "Yield Gain (t/ha)", "pr_min": "Break-even ($/ton)", "irr": "Water Req. (m³/ha)"},
    "data": compare_data
}

outpath = os.path.join(DATA, 'compare.json')
with open(outpath, 'w') as f:
    json.dump(output, f, separators=(',', ':'))

size_mb = os.path.getsize(outpath) / (1024 * 1024)
print(f"  Written compare.json ({size_mb:.1f} MB, {n_cells:,} cells × {len(CROPS)} crops)")
print("Done!")
