/**
 * map.js v3 — With price threshold binary coloring mode
 */
const MapView = (() => {
    let map = null;
    let deckOverlay = null;
    let filteredData = [];
    let currentMetric = 'dy';
    let currentStatMode = 'mean';
    let currentPalette = 'greens';
    let currentDomain = [0, 8];
    let priceThreshold = { enabled: false, value: 200 };
    let countries = [];
    let tooltipEl = null;

    const SSA_CENTER = [20, -2];
    const SSA_ZOOM = 3.2;

    const NONVIABLE_COLOR = [75, 85, 99, 120];     // gray
    // Continuous price palette: deep green → light green → yellow → orange → red
    const PRICE_PALETTE = [
        [5, 150, 105],    // well below benchmark (great)
        [16, 185, 129],   // below benchmark
        [250, 204, 21],   // near benchmark
        [245, 158, 11],   // above benchmark
        [220, 38, 38]     // well above benchmark (bad)
    ];
    function getPriceColor(breakeven, benchmark) {
        // ratio: 0 = free, 1 = exactly at benchmark, 2 = double the benchmark
        const ratio = breakeven / benchmark;
        // Map ratio to 0-1 range where 0=great (ratio~0), 0.5=benchmark, 1=bad (ratio≥2)
        const t = Math.max(0, Math.min(1, ratio / 2));
        const n = PRICE_PALETTE.length - 1;
        const i = Math.floor(t * n);
        const f = t * n - i;
        const c0 = PRICE_PALETTE[Math.min(i, n)];
        const c1 = PRICE_PALETTE[Math.min(i + 1, n)];
        return [
            Math.round(c0[0] + (c1[0] - c0[0]) * f),
            Math.round(c0[1] + (c1[1] - c0[1]) * f),
            Math.round(c0[2] + (c1[2] - c0[2]) * f),
            230
        ];
    }

    function init() {
        tooltipEl = document.getElementById('tooltip');
        map = new maplibregl.Map({
            container: 'map',
            style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
            center: SSA_CENTER, zoom: SSA_ZOOM,
            minZoom: 2, maxZoom: 14, antialias: true, attributionControl: true
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
        deckOverlay = new deck.MapboxOverlay({ interleaved: false, layers: [] });
        map.addControl(deckOverlay);
    }

    function setData(rawData, countryList) {
        countries = countryList;
        filteredData = rawData;
        updateLayer();
    }

    function setFilteredData(data) {
        filteredData = data;
        updateLayer();
    }

    function setMetric(metric, statMode, palette, domain) {
        currentMetric = metric;
        currentStatMode = statMode;
        currentPalette = palette;
        currentDomain = domain;
        updateLayer();
    }

    function setPriceThreshold(pt) {
        priceThreshold = pt;
        updateLayer();
    }

    function updateLayer() {
        const resolvedCol = Utils.resolveColumn(currentMetric, currentStatMode);
        const colIdx = Utils.COL[resolvedCol];
        const [dMin, dMax] = currentDomain;

        // For SD mode, auto-compute domain
        let effectiveMin = dMin, effectiveMax = dMax;
        if (currentStatMode === 'sd') {
            effectiveMin = 0;
            effectiveMax = 0;
            for (let i = 0; i < filteredData.length; i++) {
                const v = filteredData[i][colIdx];
                if (v != null && v > effectiveMax) effectiveMax = v;
            }
            effectiveMax = effectiveMax || 1;
        }
        const effectiveRange = effectiveMax - effectiveMin || 1;
        const effectivePalette = currentStatMode === 'sd' ? 'variance' : currentPalette;

        const usePriceMode = priceThreshold.enabled;
        const priceVal = priceThreshold.value;

        const layer = new deck.ScatterplotLayer({
            id: 'grid-cells',
            data: filteredData,
            getPosition: d => [d[Utils.COL.lon], d[Utils.COL.lat]],
            getRadius: 5000,
            radiusMinPixels: 2, radiusMaxPixels: 12, radiusUnits: 'meters',
            getFillColor: d => {
                // Price threshold mode — continuous gradient
                if (usePriceMode) {
                    if (!d[Utils.COL.viable]) return NONVIABLE_COLOR;
                    const cellPrice = d[Utils.COL.pr_min];
                    if (cellPrice == null) return NONVIABLE_COLOR;
                    return getPriceColor(cellPrice, priceVal);
                }
                // Normal metric mode
                if (!d[Utils.COL.viable]) return Utils.NON_VIABLE_COLOR;
                const val = d[colIdx];
                if (val == null) return Utils.NON_VIABLE_COLOR;
                const t = (val - effectiveMin) / effectiveRange;
                return Utils.interpolateColor(effectivePalette, t);
            },
            pickable: true,
            onHover: onHover,
            updateTriggers: {
                getFillColor: [currentMetric, currentStatMode, currentPalette, currentDomain, usePriceMode, priceVal]
            },
            transitions: { getFillColor: { duration: 300 } }
        });

        deckOverlay.setProps({ layers: [layer] });
    }

    function onHover(info) {
        if (!info.object) { tooltipEl.style.display = 'none'; return; }

        const d = info.object;
        const countryName = countries[d[Utils.COL.ci]] || 'Unknown';
        const viable = d[Utils.COL.viable];
        const resolvedCol = Utils.resolveColumn(currentMetric, currentStatMode);
        const metricVal = d[Utils.COL[resolvedCol]];
        const statSuffix = currentStatMode !== 'mean' ? ` (${currentStatMode.toUpperCase()})` : '';

        let html = `<div class="tooltip-header">
            <span class="tooltip-country">${countryName}</span>
            &nbsp;·&nbsp;${d[Utils.COL.lon].toFixed(2)}°, ${d[Utils.COL.lat].toFixed(2)}°
        </div>`;

        // Price threshold info
        if (priceThreshold.enabled && viable) {
            const cellPrice = d[Utils.COL.pr_min];
            const benchmark = priceThreshold.value;
            const isViable = cellPrice != null && cellPrice <= benchmark;
            const delta = cellPrice != null ? benchmark - cellPrice : null;
            let statusColor, statusText;
            if (cellPrice == null) {
                statusColor = '#6b7280'; statusText = '— No data';
            } else if (cellPrice <= benchmark * 0.5) {
                statusColor = '#059669'; statusText = '✓ Well below benchmark';
            } else if (cellPrice <= benchmark) {
                statusColor = '#10b981'; statusText = '✓ Below benchmark';
            } else if (cellPrice <= benchmark * 1.5) {
                statusColor = '#f59e0b'; statusText = '⚠ Above benchmark';
            } else {
                statusColor = '#dc2626'; statusText = '✗ Well above benchmark';
            }
            html += `<div class="tooltip-row">
                <span class="tooltip-label">At $${benchmark}/ton</span>
                <span class="tooltip-val" style="color:${statusColor};font-weight:700;">${statusText}</span>
            </div>`;
            html += `<div class="tooltip-row">
                <span class="tooltip-label">Break-even (min)</span>
                <span class="tooltip-val highlight">${Utils.formatMetric(cellPrice, 'pr_min')}</span>
            </div>`;
            if (delta != null) {
                const deltaSign = delta >= 0 ? '+' : '';
                const deltaColor = delta >= 0 ? '#10b981' : '#ef4444';
                html += `<div class="tooltip-row">
                    <span class="tooltip-label">Margin</span>
                    <span class="tooltip-val" style="color:${deltaColor};font-weight:600;">${deltaSign}$${Math.abs(delta).toFixed(0)}/ton</span>
                </div>`;
            }
        } else {
            html += `<div class="tooltip-row">
                <span class="tooltip-label">${getMetricLabel(currentMetric)}${statSuffix}</span>
                <span class="tooltip-val highlight">${Utils.formatMetric(metricVal, currentMetric)}</span>
            </div>`;
        }

        // Temporal variability section
        const temporalBase = ['dy', 'irr', 'kwh_min', 'kwh_max'];
        if (temporalBase.includes(currentMetric)) {
            html += `<div class="tooltip-row" style="margin-top:4px;border-top:1px solid rgba(255,255,255,0.06);padding-top:4px;">
                <span class="tooltip-label" style="font-size:9px;color:#8b5cf6;">📊 19-Year Variability</span><span class="tooltip-val"></span>
            </div>`;
            html += `<div class="tooltip-row"><span class="tooltip-label">Mean</span><span class="tooltip-val">${Utils.formatMetric(d[Utils.COL[currentMetric]], currentMetric)}</span></div>`;
            html += `<div class="tooltip-row"><span class="tooltip-label">Std Dev</span><span class="tooltip-val">${Utils.formatMetric(d[Utils.COL[currentMetric + '_sd']], currentMetric)}</span></div>`;
            html += `<div class="tooltip-row"><span class="tooltip-label">Min</span><span class="tooltip-val">${Utils.formatMetric(d[Utils.COL[currentMetric + '_lo']], currentMetric)}</span></div>`;
            html += `<div class="tooltip-row"><span class="tooltip-label">Max</span><span class="tooltip-val">${Utils.formatMetric(d[Utils.COL[currentMetric + '_hi']], currentMetric)}</span></div>`;
        }

        // Other stats
        const others = [];
        if (currentMetric !== 'cropland') others.push(['Cropland', Utils.formatMetric(d[Utils.COL.cropland], 'cropland')]);
        if (currentMetric !== 'dy') others.push(['Yield Gain', Utils.formatMetric(d[Utils.COL.dy], 'dy')]);
        if (currentMetric !== 'irr') others.push(['Water Req.', Utils.formatMetric(d[Utils.COL.irr], 'irr')]);
        if (currentMetric !== 'srad') others.push(['Solar Rad.', Utils.formatMetric(d[Utils.COL.srad], 'srad')]);
        if (currentMetric !== 'gwp_max') others.push(['GW Yield', Utils.formatMetric(d[Utils.COL.gwp_max], 'gwp_max')]);
        if (viable && !priceThreshold.enabled) {
            others.push(['Price (min)', Utils.formatMetric(d[Utils.COL.pr_min], 'pr_min')]);
            others.push(['Price (max)', Utils.formatMetric(d[Utils.COL.pr_max], 'pr_max')]);
        }
        if (others.length) {
            html += `<div style="margin-top:4px;border-top:1px solid rgba(255,255,255,0.06);padding-top:4px;">`;
            for (const [l, v] of others) html += `<div class="tooltip-row"><span class="tooltip-label">${l}</span><span class="tooltip-val">${v}</span></div>`;
            html += `</div>`;
        }

        if (!viable) html += `<div class="tooltip-nonviable">⚠ Not Economically Viable</div>`;

        tooltipEl.innerHTML = html;
        tooltipEl.style.display = 'block';
        tooltipEl.style.left = info.x + 'px';
        tooltipEl.style.top = info.y + 'px';
    }

    function getMetricLabel(m) {
        return { dy:'Yield Gain', irr:'Water Req.', kwh_min:'Energy (min)', kwh_max:'Energy (max)',
            pr_min:'Break-even (min)', pr_max:'Break-even (max)', srad:'Solar Radiation',
            cropland:'Cropland', elev:'Elevation', dtw_min:'GW Depth', gwp_max:'GW Yield',
            gwp_min:'GW Yield (low)', pv_kw:'PV Size' }[m] || m;
    }

    function flyToCountry(bounds) {
        if (!bounds || !map) return;
        map.fitBounds([[bounds[0][0],bounds[0][1]],[bounds[1][0],bounds[1][1]]], { padding: 60, duration: 1500 });
    }
    function flyToAll() {
        if (!map) return;
        map.flyTo({ center: SSA_CENTER, zoom: SSA_ZOOM, duration: 1500 });
    }

    return { init, setData, setFilteredData, setMetric, setPriceThreshold, flyToCountry, flyToAll, updateLayer };
})();
