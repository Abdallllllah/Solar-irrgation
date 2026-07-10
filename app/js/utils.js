/**
 * utils.js v3 — 30-column data with GWP columns
 */
const Utils = (() => {
    const PALETTES = {
        greens: [
            [5, 20, 15],     [6, 78, 59],     [16, 185, 129],
            [52, 211, 153],  [167, 243, 208]
        ],
        blues: [
            [8, 12, 30],     [30, 58, 138],   [59, 130, 246],
            [96, 165, 250],  [191, 219, 254]
        ],
        oranges: [
            [20, 10, 2],     [120, 53, 15],   [245, 158, 11],
            [251, 191, 36],  [254, 243, 199]
        ],
        solar: [
            [20, 15, 5],     [120, 80, 10],   [234, 179, 8],
            [250, 204, 21],  [254, 249, 195]
        ],
        depth: [
            [254, 243, 199], [250, 204, 21],  [161, 98, 7],
            [92, 45, 10],    [30, 15, 5]
        ],
        terrain: [
            [6, 78, 59],     [16, 185, 129],  [234, 179, 8],
            [180, 83, 9],    [120, 53, 15]
        ],
        viability: [
            [16, 185, 129],  [52, 211, 153],  [250, 204, 21],
            [239, 68, 68],   [127, 29, 29]
        ],
        variance: [
            [15, 10, 30],    [49, 46, 129],   [139, 92, 246],
            [167, 139, 250], [221, 214, 254]
        ]
    };

    const NON_VIABLE_COLOR = [55, 65, 81, 120];

    function interpolateColor(palette, t) {
        const colors = PALETTES[palette] || PALETTES.greens;
        t = Math.max(0, Math.min(1, t));
        const n = colors.length - 1;
        const i = Math.floor(t * n);
        const f = t * n - i;
        const c0 = colors[Math.min(i, n)];
        const c1 = colors[Math.min(i + 1, n)];
        return [
            Math.round(c0[0] + (c1[0] - c0[0]) * f),
            Math.round(c0[1] + (c1[1] - c0[1]) * f),
            Math.round(c0[2] + (c1[2] - c0[2]) * f),
            220
        ];
    }

    function paletteToCSS(palette) {
        const colors = PALETTES[palette] || PALETTES.greens;
        const stops = colors.map((c, i) => {
            const pct = (i / (colors.length - 1)) * 100;
            return `rgb(${c[0]},${c[1]},${c[2]}) ${pct}%`;
        });
        return `linear-gradient(to right, ${stops.join(', ')})`;
    }

    // ---- Column indices for 30-column data ----
    const COL = {
        lon: 0, lat: 1, cropland: 2, dtw_min: 3, dtw_max: 4,
        elev: 5, srad: 6, pv_kw: 7,
        gwp_min: 8, gwp_max: 9,
        // Irrigation temporal stats
        irr: 10, irr_sd: 11, irr_lo: 12, irr_hi: 13,
        // Energy min temporal stats
        kwh_min: 14, kwh_min_sd: 15, kwh_min_lo: 16, kwh_min_hi: 17,
        // Energy max temporal stats
        kwh_max: 18, kwh_max_sd: 19, kwh_max_lo: 20, kwh_max_hi: 21,
        // Yield gain temporal stats
        dy: 22, dy_sd: 23, dy_lo: 24, dy_hi: 25,
        // Economic
        pr_min: 26, pr_max: 27, viable: 28, ci: 29
    };

    function resolveColumn(baseMetric, statMode) {
        if (statMode === 'mean' || !statMode) return baseMetric;
        const suffix = { sd: '_sd', min: '_lo', max: '_hi' }[statMode];
        if (!suffix) return baseMetric;
        const resolved = baseMetric + suffix;
        return (resolved in COL) ? resolved : baseMetric;
    }

    function formatNumber(n, decimals = 1) {
        if (n == null) return '—';
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 10000) return (n / 1000).toFixed(1) + 'K';
        if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: decimals });
        return n.toFixed(decimals);
    }

    function formatMetric(value, metric) {
        if (value == null) return 'N/A';
        const baseMetric = metric.replace(/_(sd|lo|hi)$/, '');
        const units = {
            irr: ' m³/ha/yr', kwh_min: ' kWh', kwh_max: ' kWh',
            dy: ' t/ha', pr_min: ' $/ton', pr_max: ' $/ton',
            srad: ' kWh/m²/d', cropland: ' ha', elev: ' m',
            dtw_min: ' m', dtw_max: ' m', pv_kw: ' kWp',
            gwp_min: ' L/s', gwp_max: ' L/s'
        };
        const dec = (baseMetric === 'dy' || baseMetric === 'srad' || baseMetric === 'pv_kw' || baseMetric === 'gwp_min' || baseMetric === 'gwp_max') ? 1 : 0;
        return formatNumber(value, dec) + (units[baseMetric] || '');
    }

    function computeStats(data, colIdx) {
        let sum = 0, count = 0, min = Infinity, max = -Infinity;
        let totalCropland = 0, viableCount = 0;
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const val = row[colIdx];
            if (val != null) {
                sum += val; count++;
                if (val < min) min = val;
                if (val > max) max = val;
            }
            totalCropland += row[COL.cropland] || 0;
            if (row[COL.viable]) viableCount++;
        }
        return {
            mean: count > 0 ? sum / count : 0,
            min: min === Infinity ? 0 : min,
            max: max === -Infinity ? 0 : max,
            count, totalCropland, viableCount,
            viablePct: data.length > 0 ? (viableCount / data.length * 100) : 0
        };
    }

    function debounce(fn, ms) {
        let timer;
        return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
    }

    return {
        PALETTES, NON_VIABLE_COLOR, COL,
        interpolateColor, paletteToCSS, resolveColumn,
        formatNumber, formatMetric, computeStats, debounce
    };
})();
