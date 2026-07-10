/**
 * app.js v3 — With price threshold + combined metric filters
 */
(async function App() {
    'use strict';

    let indexData = null;
    let allData = [];
    let filteredData = [];
    let currentFert = 'FERT100';
    let dataCache = {};

    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingStatus = document.getElementById('loading-status');
    const loadingBar = document.getElementById('loading-bar');

    try { await boot(); } catch (err) {
        console.error('[App] Fatal:', err);
        loadingStatus.textContent = 'Error: ' + err.message;
    }

    async function boot() {
        updateLoading('Loading configuration...', 5);
        indexData = await fetchJSON('data/index.json');

        updateLoading('Loading map...', 15);
        MapView.init();

        updateLoading('Loading 132,439 grid cells...', 25);
        const fertData = await fetchJSON(`data/${currentFert.toLowerCase()}.json`);
        dataCache[currentFert] = fertData;
        allData = fertData.data;

        updateLoading('Processing...', 75);
        Controls.init(
            indexData.metric_configs,
            indexData.temporal_metrics || {},
            indexData.countries,
            onControlsChange
        );

        updateLoading('Rendering...', 90);
        const initialState = Controls.getState();
        applyFilters(initialState);
        MapView.setData(filteredData, fertData.countries);

        document.getElementById('cell-count').textContent = fertData.data.length.toLocaleString();

        updateLoading('Ready', 100);
        setTimeout(() => {
            loadingOverlay.classList.add('fade-out');
            setTimeout(() => { loadingOverlay.style.display = 'none'; }, 600);
        }, 400);

        console.log(`[App] Loaded ${allData.length.toLocaleString()} cells (28 cols) for ${currentFert}`);
    }

    async function onControlsChange(state) {
        // FERT change
        if (state.fert !== currentFert) {
            currentFert = state.fert;
            if (!dataCache[currentFert]) {
                loadingOverlay.style.display = 'flex';
                loadingOverlay.classList.remove('fade-out');
                updateLoading(`Loading ${currentFert}...`, 30);
                const fertData = await fetchJSON(`data/${currentFert.toLowerCase()}.json`);
                dataCache[currentFert] = fertData;
                updateLoading('Ready', 100);
                setTimeout(() => {
                    loadingOverlay.classList.add('fade-out');
                    setTimeout(() => { loadingOverlay.style.display = 'none'; }, 600);
                }, 200);
            }
            allData = dataCache[currentFert].data;
        }

        // Apply all filters
        applyFilters(state);

        // Update map metric + price threshold
        const cfg = indexData.metric_configs[state.metric];
        if (cfg) {
            MapView.setMetric(state.metric, state.statMode, cfg.palette, cfg.domain);
        }
        MapView.setPriceThreshold(state.priceThreshold);
        MapView.setFilteredData(filteredData);

        handleFlyTo(state);
    }

    function applyFilters(state) {
        const countryIdx = findCountryIndex(state.country);
        const regionName = state.region;

        let regionCountryIndices = null;
        if (regionName !== 'all') {
            const regionCountries = new Set(
                indexData.countries.filter(c => c.region === regionName).map(c => c.name)
            );
            const currentCountries = dataCache[currentFert]?.countries || [];
            regionCountryIndices = new Set();
            regionCountries.forEach(name => {
                const idx = currentCountries.indexOf(name);
                if (idx >= 0) regionCountryIndices.add(idx);
            });
        }

        // Build metric filter checks
        const filterChecks = [];
        for (const [metric, range] of Object.entries(state.metricFilters)) {
            const colIdx = Utils.COL[metric];
            if (colIdx == null) continue;
            if (range.min != null) filterChecks.push(row => {
                const v = row[colIdx];
                return v != null && v >= range.min;
            });
            if (range.max != null) filterChecks.push(row => {
                const v = row[colIdx];
                return v != null && v <= range.max;
            });
        }

        const totalBeforeMetricFilters = allData.length;

        filteredData = allData.filter(row => {
            // Country filter
            if (countryIdx !== null && row[Utils.COL.ci] !== countryIdx) return false;
            // Region filter
            if (regionCountryIndices && !regionCountryIndices.has(row[Utils.COL.ci])) return false;
            // Viability filter
            const isViable = row[Utils.COL.viable];
            if (isViable && !state.showViable) return false;
            if (!isViable && !state.showNonViable) return false;
            // Metric range filters
            for (const check of filterChecks) {
                if (!check(row)) return false;
            }
            return true;
        });

        // Update stats
        const resolvedCol = Utils.resolveColumn(state.metric, state.statMode);
        const colIdx = Utils.COL[resolvedCol];
        const stats = Utils.computeStats(filteredData, colIdx);
        Controls.updateStats(stats);

        // Viability counts
        let viableCount = 0, nonViableCount = 0;
        for (const row of filteredData) {
            if (row[Utils.COL.viable]) viableCount++;
            else nonViableCount++;
        }
        Controls.updateCounts(viableCount, nonViableCount);

        // Filter match count
        Controls.updateFilterMatch(filteredData.length, totalBeforeMetricFilters);
    }

    function findCountryIndex(name) {
        if (name === 'all') return null;
        const countries = dataCache[currentFert]?.countries || [];
        const idx = countries.indexOf(name);
        return idx >= 0 ? idx : null;
    }

    function handleFlyTo(state) {
        if (state.country !== 'all') {
            const ci = indexData.countries.find(c => c.name === state.country);
            if (ci) MapView.flyToCountry(ci.bounds);
        } else if (state.region !== 'all') {
            const rc = indexData.countries.filter(c => c.region === state.region);
            if (rc.length) {
                MapView.flyToCountry([
                    [Math.min(...rc.map(c => c.bounds[0][0])), Math.min(...rc.map(c => c.bounds[0][1]))],
                    [Math.max(...rc.map(c => c.bounds[1][0])), Math.max(...rc.map(c => c.bounds[1][1]))]
                ]);
            }
        } else {
            MapView.flyToAll();
        }
    }

    function updateLoading(msg, pct) {
        if (loadingStatus) loadingStatus.textContent = msg;
        if (loadingBar) loadingBar.style.width = pct + '%';
    }

    async function fetchJSON(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed: ${url} (${res.status})`);
        return res.json();
    }
})();
