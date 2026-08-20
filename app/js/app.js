/**
 * app.js v4 — Multi-crop + click-to-compare
 */
(async function App() {
    'use strict';

    let indexData = null;
    let allData = [];
    let filteredData = [];
    let currentFert = 'FERT100';
    let currentCrop = 'maize';
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
        indexData = await fetchJSON(`data/${currentCrop}/index.json`);

        updateLoading('Loading map...', 15);
        MapView.init();

        updateLoading('Loading 132,439 grid cells...', 25);
        const cacheKey = `${currentCrop}_${currentFert}`;
        const fertData = await fetchJSON(`data/${currentCrop}/${currentFert.toLowerCase()}.json`);
        dataCache[cacheKey] = fertData;
        allData = fertData.data;

        updateLoading('Processing...', 75);
        Controls.init(
            indexData.metric_configs,
            indexData.temporal_metrics || {},
            indexData.countries,
            onControlsChange
        );

        // Wire up crop selector
        const cropSelect = document.getElementById('crop-select');
        cropSelect.value = currentCrop;
        cropSelect.addEventListener('change', async (e) => {
            await switchCrop(e.target.value);
        });

        // Wire up click-to-compare
        Compare.init();
        ExportPDF.init();
        CountrySummary.init(indexData.countries);

        // Wire up road network + admin boundary overlays (wait for map to be ready)
        const mapGL = MapView.getMap();
        if (mapGL) {
            mapGL.on('load', async () => {
                await Roads.init(mapGL, allData);
                await Admin.init(mapGL, allData);
            });
            if (mapGL.loaded()) {
                await Roads.init(mapGL, allData);
                await Admin.init(mapGL, allData);
            }
        }

        MapView.setOnCellClick((cellData, cellIndex, info) => {
            // Find the cell index in the FULL dataset (allData), not filtered
            const fullIndex = allData.indexOf(cellData);
            const countryName = fertData.countries[cellData[Utils.COL.ci]] || 'Unknown';
            const activeFert = Controls.getState().fert;
            Compare.showCell(fullIndex >= 0 ? fullIndex : cellIndex, cellData, countryName, activeFert);
        });

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

        console.log(`[App] Loaded ${allData.length.toLocaleString()} cells for ${currentCrop}/${currentFert}`);
    }

    async function switchCrop(cropName) {
        if (cropName === currentCrop) return;
        currentCrop = cropName;
        dataCache = {};  // Clear cache to free memory

        loadingOverlay.style.display = 'flex';
        loadingOverlay.classList.remove('fade-out');
        updateLoading(`Loading ${cropName}...`, 20);

        // Reload index for new crop (domains may differ)
        indexData = await fetchJSON(`data/${currentCrop}/index.json`);
        Controls.updateConfigs(indexData.metric_configs, indexData.temporal_metrics || {});

        updateLoading(`Loading ${cropName} data...`, 50);
        const cacheKey = `${currentCrop}_${currentFert}`;
        const fertData = await fetchJSON(`data/${currentCrop}/${currentFert.toLowerCase()}.json`);
        dataCache[cacheKey] = fertData;
        allData = fertData.data;

        updateLoading('Rendering...', 80);
        const state = Controls.getState();
        applyFilters(state);
        const cfg = indexData.metric_configs[state.metric];
        if (cfg) MapView.setMetric(state.metric, state.statMode, cfg.palette, cfg.domain);
        MapView.setFilteredData(filteredData);

        document.getElementById('cell-count').textContent = allData.length.toLocaleString();

        updateLoading('Ready', 100);
        setTimeout(() => {
            loadingOverlay.classList.add('fade-out');
            setTimeout(() => { loadingOverlay.style.display = 'none'; }, 600);
        }, 200);

        console.log(`[App] Switched to ${currentCrop} — ${allData.length.toLocaleString()} cells`);
    }

    async function onControlsChange(state) {
        // FERT change
        if (state.fert !== currentFert) {
            currentFert = state.fert;
            const cacheKey = `${currentCrop}_${currentFert}`;
            if (!dataCache[cacheKey]) {
                loadingOverlay.style.display = 'flex';
                loadingOverlay.classList.remove('fade-out');
                updateLoading(`Loading ${currentFert}...`, 30);
                const fertData = await fetchJSON(`data/${currentCrop}/${currentFert.toLowerCase()}.json`);
                dataCache[cacheKey] = fertData;
                updateLoading('Ready', 100);
                setTimeout(() => {
                    loadingOverlay.classList.add('fade-out');
                    setTimeout(() => { loadingOverlay.style.display = 'none'; }, 600);
                }, 200);
            }
            allData = dataCache[cacheKey].data;
        }

        // Apply all filters
        applyFilters(state);

        // Update map metric
        const cfg = indexData.metric_configs[state.metric];
        if (cfg) {
            MapView.setMetric(state.metric, state.statMode, cfg.palette, cfg.domain);
        }
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
            const currentCountries = dataCache[`${currentCrop}_${currentFert}`]?.countries || [];
            regionCountryIndices = new Set();
            regionCountries.forEach(name => {
                const idx = currentCountries.indexOf(name);
                if (idx >= 0) regionCountryIndices.add(idx);
            });
        }

        // Build metric filter checks
        const filterChecks = [];
        let roadDistFilter = null;  // Special: not in cell array
        for (const [metric, range] of Object.entries(state.metricFilters)) {
            // Handle road_dist: uses Roads module lookup
            if (metric === 'road_dist') {
                if (typeof Roads !== 'undefined' && Roads.hasData()) {
                    roadDistFilter = { min: range.min, max: range.max };
                }
                continue;
            }
            // Handle cropland_pct: convert percentage to hectares (10km cell = 10,000 ha)
            if (metric === 'cropland_pct') {
                const colIdx = Utils.COL.cropland;
                if (colIdx == null) continue;
                if (range.min != null) {
                    const minHa = range.min * 100;
                    filterChecks.push(row => {
                        const v = row[colIdx];
                        return v != null && v >= minHa;
                    });
                }
                if (range.max != null) {
                    const maxHa = range.max * 100;
                    filterChecks.push(row => {
                        const v = row[colIdx];
                        return v != null && v <= maxHa;
                    });
                }
                continue;
            }
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
            // Road distance filter (only applies to cells with road data)
            if (roadDistFilter) {
                const dist = Roads.getDistanceByCoords(row[Utils.COL.lat], row[Utils.COL.lon]);
                if (dist != null) {
                    if (roadDistFilter.min != null && dist < roadDistFilter.min) return false;
                    if (roadDistFilter.max != null && dist > roadDistFilter.max) return false;
                }
                // Cells without road data (non-RW/KE) pass through
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

        // Update country summary table
        const countryNames = dataCache[`${currentCrop}_${currentFert}`]?.countries || [];
        CountrySummary.update(filteredData, countryNames);

        // Update admin region summary + choropleth (Rwanda/Kenya)
        const currentState = Controls.getState();
        Admin.updateRegionSummary(filteredData, currentState.country, countryNames, currentState.metric);
    }

    function findCountryIndex(name) {
        if (name === 'all') return null;
        const countries = dataCache[`${currentCrop}_${currentFert}`]?.countries || [];
        const idx = countries.indexOf(name);
        return idx >= 0 ? idx : null;
    }

    function handleFlyTo(state) {
        if (state.country !== 'all') {
            const ci = indexData.countries.find(c => c.name === state.country);
            if (ci) MapView.flyToCountry(ci.bounds);
            // Load road overlay (Rwanda/Kenya only) + admin boundaries (all 40 countries)
            Roads.loadCountry(state.country);
            Admin.loadCountry(state.country);
        } else if (state.region !== 'all') {
            const rc = indexData.countries.filter(c => c.region === state.region);
            if (rc.length) {
                MapView.flyToCountry([
                    [Math.min(...rc.map(c => c.bounds[0][0])), Math.min(...rc.map(c => c.bounds[0][1]))],
                    [Math.max(...rc.map(c => c.bounds[1][0])), Math.max(...rc.map(c => c.bounds[1][1]))]
                ]);
            }
            // Clear single-country overlays when viewing a region
            Roads.loadCountry('');
            Admin.loadCountry('');
        } else {
            MapView.flyToAll();
            // Clear single-country overlays when viewing all
            Roads.loadCountry('');
            Admin.loadCountry('');
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

    // Expose for CSV export
    window.AppData = {
        getFilteredData: () => filteredData,
        getCountryNames: () => dataCache[`${currentCrop}_${currentFert}`]?.countries || [],
        getCrop: () => currentCrop,
        getFert: () => currentFert
    };
})();
