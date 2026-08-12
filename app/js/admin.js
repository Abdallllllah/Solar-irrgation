/**
 * admin.js — Admin boundary overlay + choropleth mode + region summary.
 * Supports all 40 Sub-Saharan African countries dynamically.
 * Toggle ON  = counties/provinces/states filled by average metric value (choropleth)
 * Toggle OFF = normal dot/cell view
 */
const Admin = (() => {
    'use strict';

    let regionLookup = null;    // {cell_index_str: "Region Name"}
    let coordLookup = null;     // {"lat,lon": "Region Name"}
    let isVisible = false;
    let loadedCountry = null;
    let loadedGeoJSON = null;   // raw GeoJSON for re-coloring
    let mapInstance = null;

    const COUNTRY_ISO = {
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
    };

    function getBoundaryUrl(countryName) {
        const iso3 = COUNTRY_ISO[countryName];
        if (!iso3) return null;
        return `data/admin/${iso3}.geojson`;
    }

    // Choropleth color ramp (7-stop green→yellow→red)
    const COLOR_RAMP = [
        [0.0, [220, 38, 38]],    // red (worst)
        [0.17, [239, 68, 68]],
        [0.33, [249, 115, 22]],  // orange
        [0.5, [234, 179, 8]],    // yellow
        [0.67, [132, 204, 22]],  // lime
        [0.83, [34, 197, 94]],
        [1.0, [16, 185, 129]]    // green (best)
    ];

    function lerpColor(t, invert) {
        if (invert) t = 1 - t;
        t = Math.max(0, Math.min(1, t));
        for (let i = 0; i < COLOR_RAMP.length - 1; i++) {
            const [t0, c0] = COLOR_RAMP[i];
            const [t1, c1] = COLOR_RAMP[i + 1];
            if (t >= t0 && t <= t1) {
                const f = (t - t0) / (t1 - t0);
                return [
                    Math.round(c0[0] + (c1[0] - c0[0]) * f),
                    Math.round(c0[1] + (c1[1] - c0[1]) * f),
                    Math.round(c0[2] + (c1[2] - c0[2]) * f)
                ];
            }
        }
        return COLOR_RAMP[COLOR_RAMP.length - 1][1];
    }

    async function init(map, allData) {
        mapInstance = map;

        try {
            const res = await fetch('data/admin_regions.json');
            if (res.ok) {
                regionLookup = await res.json();
                console.log(`[Admin] Loaded regions for ${Object.keys(regionLookup).length.toLocaleString()} cells`);

                if (allData) {
                    coordLookup = {};
                    for (const [idxStr, region] of Object.entries(regionLookup)) {
                        const idx = parseInt(idxStr);
                        if (idx < allData.length) {
                            const row = allData[idx];
                            const key = row[Utils.COL.lat] + ',' + row[Utils.COL.lon];
                            coordLookup[key] = region;
                        }
                    }
                    console.log(`[Admin] Built coord lookup: ${Object.keys(coordLookup).length.toLocaleString()} entries`);
                }
            }
        } catch (e) {
            console.warn('[Admin] admin_regions.json not found:', e);
        }

        const toggle = document.getElementById('admin-toggle');
        if (toggle) {
            toggle.addEventListener('change', () => {
                isVisible = toggle.checked;
                updateVisibility();
            });
        }
    }

    async function loadCountry(countryName) {
        if (!mapInstance) return;
        const bUrl = getBoundaryUrl(countryName);
        if (!bUrl) {
            removeLayer();
            loadedCountry = null;
            loadedGeoJSON = null;
            updateRegionSummary(null, null, null);
            return;
        }
        if (loadedCountry === countryName) return;

        removeLayer();

        try {
            const res = await fetch(bUrl);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            loadedGeoJSON = await res.json();
            console.log(`[Admin] Loaded ${loadedGeoJSON.features.length} ${countryName} boundaries`);

            mapInstance.addSource('admin-bounds', { type: 'geojson', data: loadedGeoJSON });

            // Choropleth fill (colored dynamically)
            mapInstance.addLayer({
                id: 'admin-fill',
                type: 'fill',
                source: 'admin-bounds',
                layout: { 'visibility': isVisible ? 'visible' : 'none' },
                paint: {
                    'fill-color': ['coalesce', ['get', '_color'], 'rgba(96,165,250,0.1)'],
                    'fill-opacity': 0.65
                }
            });

            // Boundary outline
            mapInstance.addLayer({
                id: 'admin-line',
                type: 'line',
                source: 'admin-bounds',
                layout: {
                    'line-cap': 'round', 'line-join': 'round',
                    'visibility': isVisible ? 'visible' : 'none'
                },
                paint: {
                    'line-color': '#e2e8f0',
                    'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.8, 8, 1.5, 12, 2.5],
                    'line-opacity': 0.8
                }
            });

            // Region labels
            mapInstance.addLayer({
                id: 'admin-labels',
                type: 'symbol',
                source: 'admin-bounds',
                layout: {
                    'visibility': isVisible ? 'visible' : 'none',
                    'text-field': ['concat', ['coalesce', ['get', 'shapeName'], ['get', 'name'], ''], '\n', ['get', '_label']],
                    'text-size': ['interpolate', ['linear'], ['zoom'], 5, 8, 8, 11, 12, 14],
                    'text-font': ['Open Sans Bold'],
                    'text-anchor': 'center',
                    'text-allow-overlap': false,
                    'text-ignore-placement': false,
                    'text-line-height': 1.3
                },
                paint: {
                    'text-color': '#f1f5f9',
                    'text-halo-color': 'rgba(0,0,0,0.85)',
                    'text-halo-width': 1.5,
                    'text-opacity': 0.95
                }
            });

            loadedCountry = countryName;
        } catch (e) {
            console.warn(`[Admin] Failed to load ${countryName}:`, e);
        }
    }

    function removeLayer() {
        if (!mapInstance) return;
        try {
            if (mapInstance.getLayer('admin-labels')) mapInstance.removeLayer('admin-labels');
            if (mapInstance.getLayer('admin-line')) mapInstance.removeLayer('admin-line');
            if (mapInstance.getLayer('admin-fill')) mapInstance.removeLayer('admin-fill');
            if (mapInstance.getSource('admin-bounds')) mapInstance.removeSource('admin-bounds');
        } catch (e) { /* ignore */ }
    }

    function updateVisibility() {
        if (!mapInstance) return;
        const vis = isVisible ? 'visible' : 'none';
        try {
            if (mapInstance.getLayer('admin-fill')) mapInstance.setLayoutProperty('admin-fill', 'visibility', vis);
            if (mapInstance.getLayer('admin-line')) mapInstance.setLayoutProperty('admin-line', 'visibility', vis);
            if (mapInstance.getLayer('admin-labels')) mapInstance.setLayoutProperty('admin-labels', 'visibility', vis);
        } catch (e) { /* ignore */ }
    }

    function getRegionByCoords(lat, lon) {
        if (!coordLookup) return null;
        return coordLookup[lat + ',' + lon] || null;
    }

    /**
     * Update choropleth fills + region summary table.
     */
    function updateRegionSummary(filteredData, countryName, countries, metric) {
        const container = document.getElementById('region-summary-body');

        if (!filteredData || !coordLookup || !COUNTRY_ISO[countryName]) {
            if (container) container.innerHTML = '<div class="region-empty">Select a country to see region summary</div>';
            return;
        }

        const lowerIsBetter = metric && (metric.startsWith('pr_') || metric.startsWith('irr') || metric.startsWith('kwh'));

        // Aggregate by region
        const regionMap = {};
        for (const row of filteredData) {
            const ci = row[Utils.COL.ci];
            const cName = countries ? countries[ci] : null;
            if (cName !== countryName) continue;

            const region = getRegionByCoords(row[Utils.COL.lat], row[Utils.COL.lon]);
            if (!region) continue;

            if (!regionMap[region]) {
                regionMap[region] = { cells: 0, dySum: 0, dyCount: 0, prSum: 0, prCount: 0, rdSum: 0, rdCount: 0, metricSum: 0, metricCount: 0 };
            }
            const r = regionMap[region];
            r.cells++;

            const dy = row[Utils.COL.dy];
            if (dy != null) { r.dySum += dy; r.dyCount++; }

            const pr = row[Utils.COL.pr_min];
            if (pr != null && isFinite(pr)) { r.prSum += pr; r.prCount++; }

            if (metric) {
                const colIdx = Utils.COL[metric];
                if (colIdx != null) {
                    const mv = row[colIdx];
                    if (mv != null && isFinite(mv)) { r.metricSum += mv; r.metricCount++; }
                }
            }

            if (typeof Roads !== 'undefined' && Roads.hasData()) {
                const rd = Roads.getDistanceByCoords(row[Utils.COL.lat], row[Utils.COL.lon]);
                if (rd != null) { r.rdSum += rd; r.rdCount++; }
            }
        }

        const regions = Object.entries(regionMap)
            .map(([name, r]) => ({
                name,
                cells: r.cells,
                dy: r.dyCount > 0 ? r.dySum / r.dyCount : 0,
                pr: r.prCount > 0 ? r.prSum / r.prCount : null,
                rd: r.rdCount > 0 ? r.rdSum / r.rdCount : null,
                metricAvg: r.metricCount > 0 ? r.metricSum / r.metricCount : null
            }))
            .sort((a, b) => b.cells - a.cells);

        // Update choropleth colors
        updateChoroplethColors(regions, lowerIsBetter, metric);

        // Render summary table
        if (container) {
            if (regions.length === 0) {
                container.innerHTML = '<div class="region-empty">No cells match current filters</div>';
                return;
            }

            let html = `<table class="region-table">
                <thead><tr>
                    <th>Region</th><th>Cells</th><th>Yield</th><th>B.E.$</th><th>Road</th>
                </tr></thead><tbody>`;

            for (const r of regions) {
                html += `<tr>
                    <td class="region-name">${r.name}</td>
                    <td class="num">${r.cells}</td>
                    <td class="num">${r.dy.toFixed(1)}</td>
                    <td class="num">${r.pr != null ? '$' + Math.round(r.pr) : '—'}</td>
                    <td class="num">${r.rd != null ? r.rd.toFixed(1) + ' km' : '—'}</td>
                </tr>`;
            }

            html += '</tbody></table>';
            container.innerHTML = html;
        }
    }

    /**
     * Re-color the GeoJSON features based on per-region metric averages.
     */
    function updateChoroplethColors(regions, lowerIsBetter, metric) {
        if (!mapInstance || !loadedGeoJSON || !isVisible) return;

        const metricValues = regions.filter(r => r.metricAvg != null).map(r => r.metricAvg);
        if (metricValues.length === 0) return;

        const minVal = Math.min(...metricValues);
        const maxVal = Math.max(...metricValues);
        const range = maxVal - minVal || 1;

        const colorMap = {};
        const labelMap = {};
        for (const r of regions) {
            if (r.metricAvg != null) {
                const t = (r.metricAvg - minVal) / range;
                const rgb = lerpColor(t, lowerIsBetter);
                colorMap[r.name] = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
                labelMap[r.name] = Utils.formatMetric ? Utils.formatMetric(r.metricAvg, metric || 'dy') : r.metricAvg.toFixed(1);
            } else {
                colorMap[r.name] = 'rgba(50,50,50,0.3)';
                labelMap[r.name] = '';
            }
        }

        const updated = JSON.parse(JSON.stringify(loadedGeoJSON));
        for (const ft of updated.features) {
            const name = ft.properties.shapeName || ft.properties.name;
            ft.properties._color = colorMap[name] || 'rgba(50,50,50,0.3)';
            ft.properties._label = labelMap[name] || '';
        }

        try {
            const src = mapInstance.getSource('admin-bounds');
            if (src) src.setData(updated);
        } catch (e) {
            console.warn('[Admin] Failed to update choropleth:', e);
        }
    }

    function hasData() { return coordLookup != null; }
    function isShowing() { return isVisible; }

    return { init, loadCountry, getRegionByCoords, updateRegionSummary, hasData, isShowing, updateVisibility };
})();
