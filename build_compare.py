"""
Build compare JSON files — one per fertilizer scenario.
Reads all 7 crops' data for each fert level and extracts key metrics per cell.
Output: app/data/compare_fert100.json, compare_fert85.json, compare_fert50.json, compare_fert25.json
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
FERT_LEVELS = ['fert100', 'fert85', 'fert50', 'fert25']

# Column indices from utils.js
COL_DY = 22      # yield gain mean
COL_PR_MIN = 26  # break-even price min
COL_IRR = 10     # irrigation water req mean

print("Building compare JSON files for all fertilizer scenarios...")

for fert in FERT_LEVELS:
    print(f"\n--- {fert.upper()} ---")
    
    # Load all 7 crops for this fert level
    crop_data = {}
    for crop in CROPS:
        fpath = os.path.join(DATA, crop, f'{fert}.json')
        if not os.path.exists(fpath):
            print(f"  WARNING: {fpath} not found, skipping {crop}")
            continue
        with open(fpath, 'r') as f:
            d = json.load(f)
        crop_data[crop] = d['data']
        print(f"  Loaded {crop}: {len(d['data']):,} cells")

    if 'maize' not in crop_data:
        print(f"  ERROR: maize data missing for {fert}, skipping")
        continue

    n_cells = len(crop_data['maize'])

    # For each cell: [dy×7, pr×7, irr×7] = 21 values
    compare_data = []
    for i in range(n_cells):
        row = []
        for crop in CROPS:
            v = crop_data.get(crop, [None]*30)[i][COL_DY] if crop in crop_data and i < len(crop_data[crop]) else None
            row.append(round(v, 2) if v is not None else None)
        for crop in CROPS:
            v = crop_data.get(crop, [None]*30)[i][COL_PR_MIN] if crop in crop_data and i < len(crop_data[crop]) else None
            row.append(round(v, 1) if v is not None else None)
        for crop in CROPS:
            v = crop_data.get(crop, [None]*30)[i][COL_IRR] if crop in crop_data and i < len(crop_data[crop]) else None
            row.append(round(v, 0) if v is not None else None)
        compare_data.append(row)

    output = {
        "crops": CROPS,
        "labels": CROP_LABELS,
        "metrics": ["dy", "pr_min", "irr"],
        "metric_labels": {"dy": "Yield Gain (t/ha)", "pr_min": "Break-even ($/ton)", "irr": "Water Req. (m³/ha)"},
        "fert": fert,
        "data": compare_data
    }

    outpath = os.path.join(DATA, f'compare_{fert}.json')
    with open(outpath, 'w') as f:
        json.dump(output, f, separators=(',', ':'))

    size_mb = os.path.getsize(outpath) / (1024 * 1024)
    print(f"  Written compare_{fert}.json ({size_mb:.1f} MB, {n_cells:,} cells × {len(CROPS)} crops)")

# Also keep a copy as compare.json (fert100) for backward compat
import shutil
shutil.copy2(os.path.join(DATA, 'compare_fert100.json'), os.path.join(DATA, 'compare.json'))
print(f"\nCopied compare_fert100.json -> compare.json (backward compat)")
print("Done!")
