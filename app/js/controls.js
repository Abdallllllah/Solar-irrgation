/**
 * controls.js v3 — With price threshold + metric range filters
 */
const Controls = (() => {
    let state = {
        metric: 'dy',
        statMode: 'mean',
        fert: 'FERT100',
        country: 'all',
        region: 'all',
        showViable: true,
        showNonViable: true,
        priceThreshold: { enabled: false, value: 200 },
        metricFilters: {}
    };

    let onChangeCallback = null;
    let metricConfigs = {};
    let temporalMetrics = {};

    function init(configs, temporal, countries, onChange) {
        metricConfigs = configs;
        temporalMetrics = temporal;
        onChangeCallback = onChange;

        setupMetricSelector();
        setupStatModeToggle();
        setupFertSelector();
        setupCountrySelector(countries);
        setupViabilityToggles();
        setupPriceThreshold();
        setupMetricFilters();
        updateLegend();
        updateStatModeVisibility();
    }

    function setupMetricSelector() {
        const buttons = document.querySelectorAll('.metric-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.metric = btn.dataset.metric;
                state.statMode = 'mean';
                const statBtns = document.querySelectorAll('.stat-btn');
                statBtns.forEach(b => b.classList.remove('active'));
                statBtns[0].classList.add('active');
                updateStatModeVisibility();
                updateLegend();
                fireChange();
            });
        });
    }

    function setupStatModeToggle() {
        document.querySelectorAll('.stat-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.stat-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.statMode = btn.dataset.stat;
                updateLegend();
                fireChange();
            });
        });
    }

    function updateStatModeVisibility() {
        const container = document.getElementById('stat-mode-container');
        const cfg = metricConfigs[state.metric];
        container.style.display = (cfg && cfg.temporal) ? 'block' : 'none';
        if (!(cfg && cfg.temporal)) state.statMode = 'mean';
    }

    function setupFertSelector() {
        document.querySelectorAll('.fert-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.fert-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.fert = btn.dataset.fert;
                fireChange();
            });
        });
    }

    function setupCountrySelector(countries) {
        const select = document.getElementById('country-select');
        const regions = {};
        countries.forEach(c => {
            if (!regions[c.region]) regions[c.region] = [];
            regions[c.region].push(c);
        });
        for (const [region, list] of Object.entries(regions).sort()) {
            const group = document.createElement('optgroup');
            group.label = region.replace(/_/g, ' ');
            list.sort((a, b) => a.name.localeCompare(b.name)).forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.name;
                opt.textContent = `${c.name} (${c.cells.toLocaleString()})`;
                group.appendChild(opt);
            });
            select.appendChild(group);
        }
        select.addEventListener('change', () => {
            state.country = select.value;
            if (state.country !== 'all') {
                document.getElementById('region-select').value = 'all';
                state.region = 'all';
            }
            fireChange();
        });
        document.getElementById('region-select').addEventListener('change', (e) => {
            state.region = e.target.value;
            if (state.region !== 'all') {
                document.getElementById('country-select').value = 'all';
                state.country = 'all';
            }
            fireChange();
        });
    }

    function setupViabilityToggles() {
        document.getElementById('show-viable').addEventListener('change', (e) => {
            state.showViable = e.target.checked; fireChange();
        });
        document.getElementById('show-nonviable').addEventListener('change', (e) => {
            state.showNonViable = e.target.checked; fireChange();
        });
    }

    // ---- Price Threshold ----
    function setupPriceThreshold() {
        const toggle = document.getElementById('price-threshold-toggle');
        const slider = document.getElementById('price-slider');
        const numberInput = document.getElementById('price-value');
        const controls = document.getElementById('price-controls');
        const legend = document.getElementById('price-legend');

        toggle.addEventListener('change', () => {
            state.priceThreshold.enabled = toggle.checked;
            controls.classList.toggle('enabled', toggle.checked);
            legend.style.display = toggle.checked ? 'flex' : 'none';
            updateLegend();
            fireChange();
        });

        slider.addEventListener('input', () => {
            state.priceThreshold.value = parseInt(slider.value);
            numberInput.value = slider.value;
            fireChange();
        });

        numberInput.addEventListener('change', () => {
            let v = parseInt(numberInput.value);
            v = Math.max(50, Math.min(800, v || 200));
            numberInput.value = v;
            slider.value = v;
            state.priceThreshold.value = v;
            fireChange();
        });
    }

    // ---- Metric Range Filters ----
    function setupMetricFilters() {
        const debouncedFire = Utils.debounce(() => fireChange(), 400);

        document.querySelectorAll('.filter-row').forEach(row => {
            const metric = row.dataset.filter;
            const minInput = row.querySelector('.filter-min');
            const maxInput = row.querySelector('.filter-max');

            const handler = () => {
                const minVal = minInput.value !== '' ? parseFloat(minInput.value) : null;
                const maxVal = maxInput.value !== '' ? parseFloat(maxInput.value) : null;
                if (minVal !== null || maxVal !== null) {
                    state.metricFilters[metric] = { min: minVal, max: maxVal };
                } else {
                    delete state.metricFilters[metric];
                }
                debouncedFire();
            };

            minInput.addEventListener('input', handler);
            maxInput.addEventListener('input', handler);
        });
    }

    // ---- Legend ----
    function updateLegend() {
        const cfg = metricConfigs[state.metric];
        if (!cfg) return;

        const legendGradient = document.getElementById('legend-gradient');
        const legendTitle = document.getElementById('legend-title');
        const legendMin = document.getElementById('legend-min');
        const legendMax = document.getElementById('legend-max');

        if (state.priceThreshold.enabled) {
            legendTitle.textContent = 'Benchmark Comparison (by margin)';
            legendGradient.style.background = 'linear-gradient(to right, rgb(5,120,80) 0%, rgb(16,185,129) 50%, rgb(250,204,21) 100%)';
            legendMin.textContent = 'High margin';
            legendMax.textContent = 'At benchmark';
        } else {
            let statLabel = '';
            if (cfg.temporal && state.statMode !== 'mean') {
                statLabel = ` — ${{ sd: 'Std. Dev', min: 'Minimum', max: 'Maximum' }[state.statMode]}`;
            }
            legendTitle.textContent = `${cfg.label}${statLabel} (${cfg.unit})`;
            const palette = (state.statMode === 'sd') ? 'variance' : cfg.palette;
            legendGradient.style.background = Utils.paletteToCSS(palette);
            if (state.statMode === 'sd') {
                legendMin.textContent = '0';
                legendMax.textContent = 'High';
            } else {
                legendMin.textContent = cfg.domain[0];
                legendMax.textContent = cfg.domain[1];
            }
        }
    }

    function updateStats(stats) {
        document.getElementById('stat-visible').textContent = stats.count.toLocaleString();
        document.getElementById('stat-mean').textContent = Utils.formatMetric(stats.mean, state.metric);
        document.getElementById('stat-min').textContent = Utils.formatMetric(stats.min, state.metric);
        document.getElementById('stat-max').textContent = Utils.formatMetric(stats.max, state.metric);
        document.getElementById('stat-cropland').textContent = Utils.formatNumber(stats.totalCropland, 0) + ' ha';
        document.getElementById('stat-viable-pct').textContent = stats.viablePct.toFixed(1) + '%';
    }

    function updateCounts(viableCount, nonViableCount) {
        document.getElementById('viable-count').textContent = viableCount.toLocaleString();
        document.getElementById('nonviable-count').textContent = nonViableCount.toLocaleString();
    }

    function updateFilterMatch(matchCount, totalCount) {
        document.getElementById('filter-match-count').textContent = matchCount.toLocaleString();
        document.getElementById('filter-total-count').textContent = totalCount.toLocaleString();
    }

    function getState() { return { ...state, priceThreshold: { ...state.priceThreshold }, metricFilters: { ...state.metricFilters } }; }
    function fireChange() { if (onChangeCallback) onChangeCallback(getState()); }

    function updateConfigs(configs, temporal) {
        metricConfigs = configs;
        temporalMetrics = temporal;
        updateLegend();
    }

    return { init, getState, updateStats, updateCounts, updateFilterMatch, updateLegend, updateConfigs };
})();
