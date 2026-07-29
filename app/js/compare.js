/**
 * compare.js — Cross-Crop Comparison Panel
 * Click a cell on the map → shows all 7 crops compared with bar charts.
 */
const Compare = (() => {
    'use strict';

    let compareData = null;
    let isOpen = false;
    const CROPS = ['maize', 'cassava', 'onion', 'potato', 'sorghum', 'tomato', 'wheat'];
    const LABELS = {
        maize: '🌽 Maize', cassava: '🫘 Cassava', onion: '🧅 Onion',
        potato: '🥔 Potato', sorghum: '🌿 Sorghum', tomato: '🍅 Tomato', wheat: '🌾 Wheat'
    };
    const COLORS = {
        maize: '#f59e0b', cassava: '#8b5cf6', onion: '#ec4899',
        potato: '#f97316', sorghum: '#84cc16', tomato: '#ef4444', wheat: '#eab308'
    };

    async function init() {
        document.getElementById('compare-close').addEventListener('click', close);
        // Load compare data lazily on first click
    }

    async function ensureData() {
        if (compareData) return;
        const res = await fetch('data/compare.json');
        if (!res.ok) throw new Error('Failed to load compare.json');
        compareData = await res.json();
        console.log(`[Compare] Loaded ${compareData.data.length.toLocaleString()} cells × ${CROPS.length} crops`);
    }

    async function showCell(cellIndex, cellData, countryName) {
        await ensureData();
        if (cellIndex < 0 || cellIndex >= compareData.data.length) return;

        const row = compareData.data[cellIndex];
        const n = CROPS.length; // 7

        // Extract metrics: row = [dy×7, pr×7, irr×7]
        const dy = CROPS.map((_, i) => row[i]);
        const pr = CROPS.map((_, i) => row[n + i]);
        const irr = CROPS.map((_, i) => row[2 * n + i]);

        // Location info
        const lon = cellData[Utils.COL.lon];
        const lat = cellData[Utils.COL.lat];
        const croplandPct = (cellData[Utils.COL.cropland] / 100).toFixed(1);
        const gwp = cellData[Utils.COL.gwp_max];
        const srad = cellData[Utils.COL.srad];
        const dtw = cellData[Utils.COL.dtw_min];

        document.getElementById('compare-location').innerHTML = `
            <div class="loc-country">${countryName}</div>
            <div class="loc-coords">${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}</div>
        `;

        // Render charts
        renderChart('chart-dy', dy, 't/ha', false);
        renderChart('chart-pr', pr, '$/ton', true);
        renderChart('chart-irr', irr, 'm³/ha', true);

        // Shared info
        document.getElementById('compare-shared').innerHTML = `
            <div class="shared-title">Cell Properties (shared across crops)</div>
            <div class="shared-grid">
                <div class="shared-item"><span class="shared-label">Cropland</span><span class="shared-val">${croplandPct}%</span></div>
                <div class="shared-item"><span class="shared-label">GW Yield</span><span class="shared-val">${gwp != null ? gwp.toFixed(1) + ' L/s' : 'N/A'}</span></div>
                <div class="shared-item"><span class="shared-label">Solar</span><span class="shared-val">${srad != null ? srad.toFixed(1) + ' kWh/m²/d' : 'N/A'}</span></div>
                <div class="shared-item"><span class="shared-label">Depth to Water</span><span class="shared-val">${dtw != null ? Math.round(dtw) + ' m' : 'N/A'}</span></div>
            </div>
        `;

        open();
    }

    function renderChart(containerId, values, unit, lowerIsBetter) {
        const container = document.getElementById(containerId);
        // Pair crops with values, filter nulls
        let items = CROPS.map((crop, i) => ({ crop, value: values[i] }))
            .filter(d => d.value != null && isFinite(d.value));

        // Sort: for yield gain, highest first. For price/water, lowest first.
        if (lowerIsBetter) {
            items.sort((a, b) => a.value - b.value);
        } else {
            items.sort((a, b) => b.value - a.value);
        }

        const maxVal = Math.max(...items.map(d => d.value), 1);

        let html = '';
        items.forEach((d, i) => {
            const pct = Math.max(2, (d.value / maxVal) * 100);
            const isTop = i === 0;
            const formatted = d.value >= 1000 ? (d.value / 1000).toFixed(1) + 'K' : 
                              d.value >= 100 ? Math.round(d.value) : d.value.toFixed(1);
            html += `
                <div class="bar-row ${isTop ? 'bar-top' : ''}">
                    <div class="bar-label">${LABELS[d.crop]}</div>
                    <div class="bar-track">
                        <div class="bar-fill" style="width:${pct}%;background:${COLORS[d.crop]}"></div>
                    </div>
                    <div class="bar-value">${formatted} <span class="bar-unit">${unit}</span></div>
                </div>
            `;
        });

        // Show non-viable crops
        const nonViable = CROPS.filter((crop, i) => values[i] == null || !isFinite(values[i]));
        if (nonViable.length) {
            html += `<div class="bar-na">${nonViable.map(c => LABELS[c]).join(', ')} — N/A</div>`;
        }

        container.innerHTML = html;
    }

    function open() {
        const panel = document.getElementById('compare-panel');
        panel.classList.add('open');
        isOpen = true;
    }

    function close() {
        const panel = document.getElementById('compare-panel');
        panel.classList.remove('open');
        isOpen = false;
    }

    function isVisible() { return isOpen; }

    return { init, showCell, open, close, isVisible };
})();
