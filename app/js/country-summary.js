/**
 * country-summary.js — Aggregate stats per country in a sortable table.
 * Updates whenever filtered data changes.
 */
const CountrySummary = (() => {
    'use strict';

    let countries = [];
    let currentSort = { key: 'name', asc: true };
    let summaryData = [];
    let isOpen = false;

    function init(countryList) {
        countries = countryList;

        // Toggle open/close
        document.getElementById('country-summary-toggle').addEventListener('click', () => {
            isOpen = !isOpen;
            document.getElementById('country-summary-body').style.display = isOpen ? 'block' : 'none';
            document.getElementById('country-summary-chevron').textContent = isOpen ? '▴' : '▾';
        });

        // Sortable headers
        document.querySelectorAll('#country-table th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const key = th.dataset.sort;
                if (currentSort.key === key) {
                    currentSort.asc = !currentSort.asc;
                } else {
                    currentSort.key = key;
                    currentSort.asc = key === 'name';
                }
                // Update header classes
                document.querySelectorAll('#country-table th').forEach(h => {
                    h.classList.remove('sorted-asc', 'sorted-desc');
                });
                th.classList.add(currentSort.asc ? 'sorted-asc' : 'sorted-desc');
                renderTable();
            });
        });
    }

    function update(filteredData, countryNames) {
        // Build per-country stats
        const map = {};
        for (const row of filteredData) {
            const ci = row[Utils.COL.ci];
            const name = countryNames[ci] || 'Unknown';
            if (!map[name]) {
                map[name] = { name, cells: 0, viable: 0, dySum: 0, dyCount: 0, prSum: 0, prCount: 0 };
            }
            const c = map[name];
            c.cells++;
            if (row[Utils.COL.viable]) c.viable++;
            const dy = row[Utils.COL.dy];
            if (dy != null) { c.dySum += dy; c.dyCount++; }
            const pr = row[Utils.COL.pr_min];
            if (pr != null && isFinite(pr)) { c.prSum += pr; c.prCount++; }
        }

        summaryData = Object.values(map).map(c => ({
            name: c.name,
            cells: c.cells,
            viable: c.cells > 0 ? (c.viable / c.cells * 100) : 0,
            dy: c.dyCount > 0 ? c.dySum / c.dyCount : 0,
            pr: c.prCount > 0 ? c.prSum / c.prCount : null
        }));

        renderTable();
    }

    function renderTable() {
        const sorted = [...summaryData].sort((a, b) => {
            let va = a[currentSort.key], vb = b[currentSort.key];
            if (va == null) va = Infinity;
            if (vb == null) vb = Infinity;
            if (typeof va === 'string') {
                return currentSort.asc ? va.localeCompare(vb) : vb.localeCompare(va);
            }
            return currentSort.asc ? va - vb : vb - va;
        });

        const tbody = document.getElementById('country-table-body');
        let html = '';
        for (const c of sorted) {
            const viableClass = c.viable >= 90 ? 'high' : c.viable >= 70 ? 'med' : 'low';
            html += `<tr class="country-row" data-country="${c.name}">
                <td class="country-name-cell">${c.name}</td>
                <td class="num">${c.cells.toLocaleString()}</td>
                <td class="num viable-${viableClass}">${c.viable.toFixed(0)}%</td>
                <td class="num">${c.dy.toFixed(1)}</td>
                <td class="num">${c.pr != null ? '$' + Math.round(c.pr) : '—'}</td>
            </tr>`;
        }
        tbody.innerHTML = html;

        // Click row to filter by country
        tbody.querySelectorAll('.country-row').forEach(row => {
            row.addEventListener('click', () => {
                const name = row.dataset.country;
                const select = document.getElementById('country-select');
                if (select) {
                    select.value = name;
                    select.dispatchEvent(new Event('change'));
                }
            });
        });
    }

    return { init, update };
})();
