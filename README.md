# ☀ Solar Irrigation Potential — Sub-Saharan Africa

An interactive decision-support tool for exploring the techno-economic potential of solar-powered irrigation across **40 Sub-Saharan African countries**, covering **7 crops** and **132,000+ grid cells**.

🔗 **Live Demo**: [Netlify deployment](https://solar-irrigation-ssa.netlify.app/)

---

## 📋 Table of Contents

- [Quick Start](#-quick-start)
- [Project Structure](#-project-structure)
- [Features](#-features)
- [Data Pipeline](#-data-pipeline)
- [How to Update Data](#-how-to-update-data)
- [How to Add a New Crop](#-how-to-add-a-new-crop)
- [How to Add Road Data for a New Country](#-how-to-add-road-data-for-a-new-country)
- [Deployment](#-deployment)
- [Data Sources](#-data-sources)

---

## 🚀 Quick Start

**Prerequisites**: Python 3.x, a modern web browser, Git

```bash
# 1. Clone the repository
git clone https://github.com/Abdallllllah/Solar-Iriigation.git
cd Solar-Iriigation

# 2. Start a local web server
cd app
python -m http.server 8080

# 3. Open in browser
# Visit http://localhost:8080
```

No build tools, no npm, no Node.js. It's a pure static site.

---

## 📁 Project Structure

```
Solar-Iriigation/
├── app/                          ← The web application (deployed to Netlify)
│   ├── index.html                ← Main HTML (sidebar, header, modals)
│   ├── css/
│   │   └── design-system.css     ← All styles (dark theme, glassmorphism)
│   ├── js/
│   │   ├── utils.js              ← Column indices, formatting, color scales
│   │   ├── map.js                ← MapLibre GL + Deck.gl rendering
│   │   ├── controls.js           ← Sidebar controls (filters, fert, metric)
│   │   ├── roads.js              ← Road network overlay (RW & KE)
│   │   ├── admin.js              ← Admin boundary choropleth mode
│   │   ├── country-summary.js    ← Country filter + fly-to
│   │   ├── compare.js            ← Cross-crop comparison panel
│   │   ├── export.js             ← PDF + CSV export
│   │   └── app.js                ← Main app controller (data loading, filtering)
│   └── data/
│       ├── maize/                ← Per-crop data folders
│       │   ├── index.json        ← Metadata (country list, column count)
│       │   ├── fert100.json      ← 132K cells × 30 columns at FERT100
│       │   ├── fert85.json
│       │   ├── fert50.json
│       │   └── fert25.json
│       ├── cassava/              ← Same structure for each crop
│       ├── onion/
│       ├── potato/
│       ├── sorghum/
│       ├── tomato/
│       ├── wheat/
│       ├── compare_fert100.json  ← Cross-crop data per fert scenario
│       ├── compare_fert85.json
│       ├── compare_fert50.json
│       ├── compare_fert25.json
│       ├── admin/                ← GeoJSON boundaries (40 countries)
│       │   ├── KEN.geojson
│       │   ├── RWA.geojson
│       │   └── ... (40 files)
│       ├── admin_regions.json    ← Cell-to-region spatial lookup
│       ├── roads_ky.geojson      ← Kenya road network
│       ├── roads_rw.geojson      ← Rwanda road network
│       └── road_distances.json   ← Cell-to-road distances
│
├── preprocess.py                 ← CSV → JSON converter (per crop)
├── build_compare.py              ← Builds cross-crop compare files
├── download_all_admin.py         ← Downloads geoBoundaries GeoJSON
├── preprocess_admin.py           ← Builds admin_regions.json spatial lookup
├── preprocess_roads.py           ← Processes road shapefiles → GeoJSON + distances
└── .gitignore
```

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **7 Crops** | Maize, Cassava, Onion, Potato, Sorghum, Tomato, Wheat |
| **4 Fertilizer Scenarios** | FERT100, FERT85, FERT50, FERT25 |
| **8 Map Metrics** | Yield Gain, Water Req, Energy, Break-even Price, Solar Rad, GW Depth, PV Size, GW Yield |
| **Temporal Stats** | Mean, Std Dev, Min, Max across 19 years (2001-2019) |
| **40 SSA Countries** | Country filter with fly-to navigation |
| **Admin Boundaries** | ADM1 choropleth mode for sub-national analysis |
| **Road Network** | Paved/unpaved road overlay + distance metric (RW & KE) |
| **Investment Filters** | Multi-metric range filtering |
| **Cross-Crop Compare** | Click any cell to compare all 7 crops side-by-side |
| **Viability Filter** | Toggle economically viable vs non-viable cells |
| **Export PDF** | Map screenshot + stats + filters as a dark-themed PDF |
| **Export CSV** | Download all visible cells with 29 data columns |
| **About Modal** | In-app documentation of all metrics and methodology |

---

## 🔧 Data Pipeline

The raw data starts as CSV files from the Wamalwa et al. 2024 Zenodo repository. Here's the processing chain:

```
CSV files (raw)
    │
    ├── preprocess.py <crop>        → app/data/<crop>/fert*.json + index.json
    │
    ├── build_compare.py            → app/data/compare_fert*.json
    │
    ├── download_all_admin.py       → app/data/admin/<ISO3>.geojson
    │
    ├── preprocess_admin.py         → app/data/admin_regions.json
    │
    └── preprocess_roads.py         → app/data/roads_*.geojson + road_distances.json
```

### Running the full pipeline

```bash
# Step 1: Process all 7 crops (requires *_crop_data.csv files in root)
python preprocess.py maize
python preprocess.py cassava
python preprocess.py onion
python preprocess.py potato
python preprocess.py sorghum
python preprocess.py tomato
python preprocess.py wheat

# Step 2: Build cross-crop comparison files
python build_compare.py

# Step 3: Download admin boundaries (requires internet)
python download_all_admin.py

# Step 4: Build spatial lookup
python preprocess_admin.py

# Step 5: Process road data (requires shapefiles in Road predictions/)
python preprocess_roads.py
```

---

## 📝 How to Update Data

If you receive updated CSV files from the researchers:

1. Place the new `<crop>_crop_data.csv` file in the project root
2. Run: `python preprocess.py <crop>` (e.g., `python preprocess.py maize`)
3. Run: `python build_compare.py` (regenerates cross-crop comparison)
4. Commit and push:
   ```bash
   git add -A
   git commit -m "Update <crop> data"
   git push origin master
   ```
5. Netlify auto-deploys within ~30 seconds

---

## 🌾 How to Add a New Crop

1. **Get the CSV**: Obtain `<newcrop>_crop_data.csv` with the same column format
2. **Add to crop list**: Edit `preprocess.py` line 17 — add the new crop name to `AVAILABLE_CROPS`
3. **Run preprocessing**:
   ```bash
   python preprocess.py <newcrop>
   python build_compare.py
   ```
4. **Update the UI**: In `app/index.html`, add an `<option>` to the crop selector (line ~78):
   ```html
   <option value="newcrop">🌱 New Crop</option>
   ```
5. **Update compare.js**: Add the crop to the `CROPS`, `LABELS`, and `COLORS` arrays
6. **Commit and push**

---

## 🛣️ How to Add Road Data for a New Country

When road prediction shapefiles become available for additional countries:

1. Place the shapefile folder in `Road predictions/<Country>/` with `paved.shp` and `unpaved.shp`
2. Edit `preprocess_roads.py` to add the new country to the country list
3. Run: `python preprocess_roads.py`
4. The road distance calculation and GeoJSON conversion happen automatically
5. Update `app/js/roads.js` to include the new country code in the loading logic
6. Commit and push

---

## 🌐 Deployment

The app is deployed on **Netlify** via GitHub integration:

- **Repository**: `github.com/Abdallllllah/Solar-Iriigation`
- **Branch**: `master`
- **Base directory**: `app/`
- **Build command**: None (static site)
- **Publish directory**: `app/`

**Every push to `master` auto-deploys** to Netlify within ~30 seconds.

### Custom Domain Setup

1. Buy a domain (e.g., from Namecheap, Google Domains)
2. In Netlify Dashboard → Domain settings → Add custom domain
3. Update DNS records as instructed by Netlify
4. Netlify provides free SSL/HTTPS automatically

---

## 📊 Data Sources

| Dataset | Source | License |
|---------|--------|---------|
| Crop & Irrigation Simulations | [Wamalwa et al. 2024 (Zenodo)](https://zenodo.org/records/11080370) | Open |
| Admin Boundaries (ADM1) | [geoBoundaries](https://www.geoboundaries.org) | CC-BY 4.0 |
| Road Network | Sentinel-2 ML Predictions | Research |

---

## 📐 Technical Details

- **Frontend**: Pure HTML/CSS/JS — no frameworks, no build tools
- **Map Engine**: MapLibre GL JS v4.7.1 (open-source Mapbox GL fork)
- **Data Overlay**: Deck.gl v9.1.4 (WebGL-accelerated scatter plot)
- **Basemap**: CARTO Dark Matter (free tile server)
- **PDF Export**: jsPDF v2.5.2 (CDN-loaded)
- **Hosting**: Netlify (free tier, auto-deploy from GitHub)
- **Data Format**: Compact JSON arrays (no keys per row, column-indexed)

### Performance Notes

- Each crop/fert JSON file is ~13-15 MB raw, compressed to ~2-3 MB via Netlify's Brotli compression
- Admin boundaries load on-demand per country (~20-50 KB each)
- Road data loads on-demand per country (~1-3 MB each)
- Compare data loads on-demand per fert scenario (~15 MB raw, ~3 MB compressed)
