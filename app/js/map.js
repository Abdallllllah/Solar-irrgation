/**
 * map.js v4 — With click-to-compare support
 */
const MapView = (() => {
    let map = null;
    let deckOverlay = null;
    let filteredData = [];
    let currentMetric = 'dy';
    let currentStatMode = 'mean';
    let currentPalette = 'greens';
    let currentDomain = [0, 8];
    let countries = [];
    let tooltipEl = null;
    let onCellClick = null;

    const SSA_CENTER = [20, -2];
    const SSA_ZOOM = 3.2;

    const NONVIABLE_COLOR = [75, 85, 99, 120];     // gray

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

    function setOnCellClick(cb) { onCellClick = cb; }

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

        const layer = new deck.ScatterplotLayer({
            id: 'grid-cells',
            data: filteredData,
            getPosition: d => [d[Utils.COL.lon], d[Utils.COL.lat]],
            getRadius: 5000,
            radiusMinPixels: 2, radiusMaxPixels: 12, radiusUnits: 'meters',
            getFillColor: d => {
                if (!d[Utils.COL.viable]) return Utils.NON_VIABLE_COLOR;
                const val = d[colIdx];
                if (val == null) return Utils.NON_VIABLE_COLOR;
                const t = (val - effectiveMin) / effectiveRange;
                return Utils.interpolateColor(effectivePalette, t);
            },
            pickable: true,
            onHover: onHover,
            onClick: (info) => {
                if (info.object && onCellClick) {
                    const idx = filteredData.indexOf(info.object);
                    onCellClick(info.object, idx, info);
                }
            },
            updateTriggers: {
                getFillColor: [currentMetric, currentStatMode, currentPalette, currentDomain]
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

        // Primary metric
        html += `<div class="tooltip-row">
            <span class="tooltip-label">${getMetricLabel(currentMetric)}${statSuffix}</span>
            <span class="tooltip-val highlight">${Utils.formatMetric(metricVal, currentMetric)}</span>
        </div>`;

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
        if (currentMetric !== 'cropland') {
            const clHa = d[Utils.COL.cropland];
            const clPct = clHa != null ? (clHa / 100).toFixed(1) + '%' : 'N/A';
            others.push(['Cropland', clPct]);
        }
        if (currentMetric !== 'dy') others.push(['Yield Gain', Utils.formatMetric(d[Utils.COL.dy], 'dy')]);
        if (currentMetric !== 'irr') others.push(['Water Req.', Utils.formatMetric(d[Utils.COL.irr], 'irr')]);
        if (currentMetric !== 'srad') others.push(['Solar Rad.', Utils.formatMetric(d[Utils.COL.srad], 'srad')]);
        if (currentMetric !== 'gwp_max') others.push(['GW Yield', Utils.formatMetric(d[Utils.COL.gwp_max], 'gwp_max')]);
        if (viable) {
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

    return { init, setData, setFilteredData, setMetric, setOnCellClick, flyToCountry, flyToAll, updateLayer };
})();
