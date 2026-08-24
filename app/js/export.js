/**
 * export.js — PDF + CSV Export
 * PDF: Captures the current map view + summary stats into a clean PDF report.
 * CSV: Downloads all currently filtered/visible cells with human-readable headers.
 */
const ExportPDF = (() => {
    'use strict';

    const { jsPDF } = window.jspdf;

    // Brand colors
    const AMBER = [245, 158, 11];
    const DARK_BG = [24, 24, 27];
    const TEXT_PRIMARY = [250, 250, 250];
    const TEXT_SECONDARY = [161, 161, 170];

    /** Strip emoji and extra whitespace from text (jsPDF can't render emoji) */
    function stripEmoji(str) {
        return str.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}]/gu, '').trim();
    }

    function init() {
        const pdfBtn = document.getElementById('export-pdf-btn');
        if (pdfBtn) pdfBtn.addEventListener('click', generatePDF);
        const csvBtn = document.getElementById('export-csv-btn');
        if (csvBtn) csvBtn.addEventListener('click', generateCSV);
    }

    /**
     * Capture the full map view by compositing all canvas layers
     * (MapLibre basemap + Deck.gl data overlay)
     */
    function captureMapComposite() {
        const container = document.getElementById('map');
        if (!container) return null;

        const canvases = container.querySelectorAll('canvas');
        if (!canvases.length) return null;

        const w = canvases[0].width;
        const h = canvases[0].height;

        const composite = document.createElement('canvas');
        composite.width = w;
        composite.height = h;
        const ctx = composite.getContext('2d');

        canvases.forEach(c => {
            try { ctx.drawImage(c, 0, 0); } catch (e) {
                console.warn('[Export] Could not draw canvas layer:', e);
            }
        });

        return { dataUrl: composite.toDataURL('image/png'), width: w, height: h };
    }

    // ===================== PDF =====================

    async function generatePDF() {
        const btn = document.getElementById('export-pdf-btn');
        const originalText = btn.textContent;
        btn.textContent = '  Generating...';
        btn.disabled = true;

        try {
            await new Promise(r => setTimeout(r, 150));

            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            const pageW = doc.internal.pageSize.getWidth();
            const pageH = doc.internal.pageSize.getHeight();

            // Dark background
            doc.setFillColor(...DARK_BG);
            doc.rect(0, 0, pageW, pageH, 'F');

            // Header bar
            doc.setFillColor(30, 30, 34);
            doc.rect(0, 0, pageW, 18, 'F');
            doc.setFillColor(...AMBER);
            doc.rect(0, 17.5, pageW, 0.5, 'F');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.setTextColor(...TEXT_PRIMARY);
            doc.text('Solar Irrigation Potential - Report', 10, 12);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(...TEXT_SECONDARY);
            const now = new Date();
            doc.text('Generated: ' + now.toLocaleDateString() + ' ' + now.toLocaleTimeString(), pageW - 10, 12, { align: 'right' });

            // Map capture
            const mapCapture = captureMapComposite();
            const mapY = 22;
            const mapMaxW = 185;
            const mapMaxH = 130;

            if (mapCapture) {
                const ratio = mapCapture.width / mapCapture.height;
                let imgW = mapMaxW;
                let imgH = imgW / ratio;
                if (imgH > mapMaxH) { imgH = mapMaxH; imgW = imgH * ratio; }
                doc.addImage(mapCapture.dataUrl, 'PNG', 8, mapY, imgW, imgH);
            } else {
                doc.setFillColor(35, 35, 40);
                doc.roundedRect(8, mapY, mapMaxW, mapMaxH, 3, 3, 'F');
                doc.setTextColor(...TEXT_SECONDARY);
                doc.setFontSize(10);
                doc.text('Map capture unavailable', 8 + mapMaxW / 2, mapY + mapMaxH / 2, { align: 'center' });
            }

            // Right panel
            const panelX = 200;
            const panelW = 90;

            const crop = document.getElementById('crop-select');
            const cropName = crop ? stripEmoji(crop.options[crop.selectedIndex].text) : 'Unknown';
            const fertBtns = document.querySelectorAll('.fert-btn.active');
            const fertLevel = fertBtns.length ? fertBtns[0].textContent.trim() : '100%';
            const metricBtns = document.querySelectorAll('.metric-btn.active');
            const metricName = metricBtns.length ? stripEmoji(metricBtns[0].querySelector('.metric-name').textContent) : 'Unknown';
            const metricUnit = metricBtns.length ? metricBtns[0].querySelector('.metric-unit').textContent.trim() : '';
            const countrySelect = document.getElementById('country-select');
            const countryName = countrySelect ? countrySelect.options[countrySelect.selectedIndex].text.trim() : 'All';
            const regionSelect = document.getElementById('region-select');
            const regionName = regionSelect ? regionSelect.options[regionSelect.selectedIndex].text.trim() : 'All';

            // Configuration section
            let y = mapY;
            doc.setFillColor(35, 35, 40);
            doc.roundedRect(panelX, y, panelW, 42, 2, 2, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(...AMBER);
            doc.text('CONFIGURATION', panelX + 5, y + 7);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            const configRows = [
                ['Crop', cropName], ['Fertilizer', fertLevel],
                ['Map Metric', metricName + ' (' + metricUnit + ')'],
                ['Country', countryName], ['Region', regionName]
            ];
            configRows.forEach((row, i) => {
                const rowY = y + 14 + i * 5.5;
                doc.setTextColor(...TEXT_SECONDARY);
                doc.text(row[0], panelX + 5, rowY);
                doc.setTextColor(...TEXT_PRIMARY);
                doc.text(row[1], panelX + panelW - 5, rowY, { align: 'right' });
            });

            // Summary Statistics section
            y += 48;
            doc.setFillColor(35, 35, 40);
            doc.roundedRect(panelX, y, panelW, 36, 2, 2, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(...AMBER);
            doc.text('SUMMARY STATISTICS', panelX + 5, y + 7);

            const statIds = [
                ['Visible Cells', 'stat-visible'], ['Mean Value', 'stat-mean'],
                ['Min', 'stat-min'], ['Max', 'stat-max'], ['Total Cropland', 'stat-cropland']
            ];
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            statIds.forEach((row, i) => {
                const rowY = y + 14 + i * 4.5;
                const el = document.getElementById(row[1]);
                const val = el ? el.textContent.trim() : '-';
                doc.setTextColor(...TEXT_SECONDARY);
                doc.text(row[0], panelX + 5, rowY);
                doc.setTextColor(...TEXT_PRIMARY);
                doc.text(val, panelX + panelW - 5, rowY, { align: 'right' });
            });

            // Active Filters section
            y += 42;
            const filterRows = [];
            document.querySelectorAll('.filter-row').forEach(row => {
                const minInput = row.querySelector('.filter-min');
                const maxInput = row.querySelector('.filter-max');
                const label = row.querySelector('.filter-label');
                const minVal = minInput ? minInput.value : '';
                const maxVal = maxInput ? maxInput.value : '';
                if (minVal || maxVal) {
                    const name = label ? stripEmoji(label.textContent.trim()) : 'Filter';
                    let range = '';
                    if (minVal && maxVal) range = minVal + ' to ' + maxVal;
                    else if (minVal) range = 'min ' + minVal;
                    else range = 'max ' + maxVal;
                    filterRows.push([name, range]);
                }
            });

            const filterH = filterRows.length ? 10 + filterRows.length * 5 : 14;
            doc.setFillColor(35, 35, 40);
            doc.roundedRect(panelX, y, panelW, filterH, 2, 2, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(...AMBER);
            doc.text('ACTIVE FILTERS', panelX + 5, y + 7);

            if (filterRows.length === 0) {
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(7);
                doc.setTextColor(...TEXT_SECONDARY);
                doc.text('No filters active', panelX + 5, y + 12);
            } else {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7);
                filterRows.forEach((row, i) => {
                    const rowY = y + 13 + i * 5;
                    doc.setTextColor(...TEXT_SECONDARY);
                    doc.text(row[0], panelX + 5, rowY);
                    doc.setTextColor(...TEXT_PRIMARY);
                    doc.text(row[1], panelX + panelW - 5, rowY, { align: 'right' });
                });
            }

            // Footer (page 1)
            doc.setFillColor(30, 30, 34);
            doc.rect(0, pageH - 10, pageW, 10, 'F');
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6);
            doc.setTextColor(...TEXT_SECONDARY);
            doc.text('Data: Wamalwa et al. 2024  |  Admin Boundaries: geoBoundaries (CC-BY 4.0)  |  Roads: Sentinel-2 ML (RW & KE)', 10, pageH - 4);
            doc.text('Solar Irrigation Potential in Sub-Saharan Africa', pageW - 10, pageH - 4, { align: 'right' });

            // ---- Page 2: Cross-Crop Comparison (only if panel is open) ----
            const comparePanel = document.getElementById('compare-panel');
            if (comparePanel && comparePanel.classList.contains('open')) {
                doc.addPage();

                // Dark background
                doc.setFillColor(...DARK_BG);
                doc.rect(0, 0, pageW, pageH, 'F');

                // Header bar
                doc.setFillColor(30, 30, 34);
                doc.rect(0, 0, pageW, 18, 'F');
                doc.setFillColor(...AMBER);
                doc.rect(0, 17.5, pageW, 0.5, 'F');

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(14);
                doc.setTextColor(...TEXT_PRIMARY);
                doc.text('Cross-Crop Comparison', 10, 12);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                doc.setTextColor(...TEXT_SECONDARY);
                doc.text('Page 2 of 2', pageW - 10, 12, { align: 'right' });

                // Location info
                const locEl = document.getElementById('compare-location');
                const locCountry = locEl ? locEl.querySelector('.loc-country') : null;
                const locCoords = locEl ? locEl.querySelector('.loc-coords') : null;

                let cy = 26;
                if (locCountry) {
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(12);
                    doc.setTextColor(...AMBER);
                    doc.text(stripEmoji(locCountry.textContent), 10, cy);
                    cy += 5;
                }
                if (locCoords) {
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(8);
                    doc.setTextColor(...TEXT_SECONDARY);
                    doc.text(locCoords.textContent.trim(), 10, cy);
                    cy += 8;
                }

                // Helper: scrape chart data from a compare-chart container
                function scrapeChart(chartId) {
                    const container = document.getElementById(chartId);
                    if (!container) return [];
                    const rows = container.querySelectorAll('.bar-row');
                    const items = [];
                    rows.forEach(row => {
                        const label = row.querySelector('.bar-label');
                        const value = row.querySelector('.bar-value');
                        const fill = row.querySelector('.bar-fill');
                        if (label && value) {
                            const pct = fill ? parseFloat(fill.style.width) || 0 : 0;
                            // Extract RGB from fill background
                            let color = [150, 150, 150];
                            if (fill && fill.style.background) {
                                const m = fill.style.background.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
                                if (m) color = [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
                                // Try hex
                                const hm = fill.style.background.match(/#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
                                if (hm) color = [parseInt(hm[1], 16), parseInt(hm[2], 16), parseInt(hm[3], 16)];
                            }
                            items.push({
                                label: stripEmoji(label.textContent.trim()),
                                value: stripEmoji(value.textContent.trim()),
                                pct: pct,
                                color: color
                            });
                        }
                    });
                    return items;
                }

                // Render a chart section in the PDF
                function renderPdfChart(title, chartId, startY, colX) {
                    const items = scrapeChart(chartId);
                    const chartW = 120;

                    doc.setFillColor(35, 35, 40);
                    const chartH = 12 + items.length * 9;
                    doc.roundedRect(colX, startY, chartW, chartH, 2, 2, 'F');

                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(9);
                    doc.setTextColor(...AMBER);
                    doc.text(title.toUpperCase(), colX + 5, startY + 7);

                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(7);

                    items.forEach((item, i) => {
                        const rowY = startY + 14 + i * 9;

                        // Label
                        doc.setTextColor(...TEXT_PRIMARY);
                        doc.text(item.label, colX + 5, rowY);

                        // Bar background
                        doc.setFillColor(45, 45, 50);
                        doc.roundedRect(colX + 35, rowY - 3.5, 50, 5, 1, 1, 'F');

                        // Bar fill
                        const barW = Math.max(1, (item.pct / 100) * 50);
                        doc.setFillColor(...item.color);
                        doc.roundedRect(colX + 35, rowY - 3.5, barW, 5, 1, 1, 'F');

                        // Value
                        doc.setTextColor(...TEXT_SECONDARY);
                        doc.text(item.value, colX + chartW - 5, rowY, { align: 'right' });
                    });

                    return startY + chartH + 6;
                }

                // Render 3 charts
                let leftY = cy;
                leftY = renderPdfChart('Yield Gain (t/ha)', 'chart-dy', leftY, 10);
                leftY = renderPdfChart('Break-even Price ($/ton)', 'chart-pr', leftY, 10);
                leftY = renderPdfChart('Water Requirement (m3/ha)', 'chart-irr', leftY, 10);

                // Shared cell properties (right side)
                const sharedEl = document.getElementById('compare-shared');
                if (sharedEl) {
                    const sharedItems = sharedEl.querySelectorAll('.shared-item');
                    if (sharedItems.length) {
                        const spX = 145;
                        const spW = 90;
                        doc.setFillColor(35, 35, 40);
                        doc.roundedRect(spX, cy, spW, 10 + sharedItems.length * 6, 2, 2, 'F');

                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(9);
                        doc.setTextColor(...AMBER);
                        doc.text('CELL PROPERTIES', spX + 5, cy + 7);

                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(7);
                        sharedItems.forEach((item, i) => {
                            const rowY = cy + 14 + i * 6;
                            const lbl = item.querySelector('.shared-label');
                            const val = item.querySelector('.shared-val');
                            doc.setTextColor(...TEXT_SECONDARY);
                            doc.text(stripEmoji(lbl ? lbl.textContent : ''), spX + 5, rowY);
                            doc.setTextColor(...TEXT_PRIMARY);
                            doc.text(stripEmoji(val ? val.textContent : ''), spX + spW - 5, rowY, { align: 'right' });
                        });
                    }
                }

                // Footer (page 2)
                doc.setFillColor(30, 30, 34);
                doc.rect(0, pageH - 10, pageW, 10, 'F');
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(6);
                doc.setTextColor(...TEXT_SECONDARY);
                doc.text('Data: Wamalwa et al. 2024  |  Admin Boundaries: geoBoundaries (CC-BY 4.0)  |  Roads: Sentinel-2 ML (RW & KE)', 10, pageH - 4);
                doc.text('Solar Irrigation Potential in Sub-Saharan Africa', pageW - 10, pageH - 4, { align: 'right' });
            }

            // Save
            const filename = 'solar_irrigation_' + cropName + '_' + fertLevel + '_' + now.toISOString().slice(0, 10) + '.pdf';
            doc.save(filename);

        } catch (err) {
            console.error('[Export] PDF generation failed:', err);
            alert('PDF export failed. Please try again.');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    // ===================== CSV =====================

    function generateCSV() {
        const btn = document.getElementById('export-csv-btn');
        const originalText = btn.textContent;
        btn.textContent = '  Exporting...';
        btn.disabled = true;

        try {
            const data = window.AppData.getFilteredData();
            const countries = window.AppData.getCountryNames();
            const crop = window.AppData.getCrop();
            const fert = window.AppData.getFert();
            const C = Utils.COL;

            if (!data || !data.length) {
                alert('No data to export. Adjust your filters to show cells on the map.');
                return;
            }

            const headers = [
                'Longitude', 'Latitude', 'Country',
                'Cropland (%)', 'Depth to Water Min (m)', 'Depth to Water Max (m)',
                'Elevation (m)', 'Solar Radiation (kWh/m2/d)', 'PV System Size (kWp)',
                'GW Yield Min (L/s)', 'GW Yield Max (L/s)',
                'Water Req Mean (m3/ha/yr)', 'Water Req SD', 'Water Req Min', 'Water Req Max',
                'Energy Min Mean (kWh)', 'Energy Min SD', 'Energy Min Low', 'Energy Min High',
                'Energy Max Mean (kWh)', 'Energy Max SD', 'Energy Max Low', 'Energy Max High',
                'Yield Gain Mean (t/ha)', 'Yield Gain SD', 'Yield Gain Min', 'Yield Gain Max',
                'Break-even Price Min ($/ton)', 'Break-even Price Max ($/ton)',
                'Economically Viable'
            ];

            let csv = headers.join(',') + '\n';

            for (const row of data) {
                const countryName = countries[row[C.ci]] || 'Unknown';
                const viable = row[C.viable] === 1 ? 'Yes' : 'No';
                const croplandPct = row[C.cropland] != null ? (row[C.cropland] / 100).toFixed(1) : '';

                const vals = [
                    row[C.lon], row[C.lat], '"' + countryName + '"',
                    croplandPct,
                    row[C.dtw_min] != null ? row[C.dtw_min].toFixed(1) : '',
                    row[C.dtw_max] != null ? row[C.dtw_max].toFixed(1) : '',
                    row[C.elev] != null ? Math.round(row[C.elev]) : '',
                    row[C.srad] != null ? row[C.srad].toFixed(2) : '',
                    row[C.pv_kw] != null ? row[C.pv_kw].toFixed(2) : '',
                    row[C.gwp_min] != null ? row[C.gwp_min].toFixed(1) : '',
                    row[C.gwp_max] != null ? row[C.gwp_max].toFixed(1) : '',
                    row[C.irr] != null ? Math.round(row[C.irr]) : '',
                    row[C.irr_sd] != null ? Math.round(row[C.irr_sd]) : '',
                    row[C.irr_lo] != null ? Math.round(row[C.irr_lo]) : '',
                    row[C.irr_hi] != null ? Math.round(row[C.irr_hi]) : '',
                    row[C.kwh_min] != null ? Math.round(row[C.kwh_min]) : '',
                    row[C.kwh_min_sd] != null ? Math.round(row[C.kwh_min_sd]) : '',
                    row[C.kwh_min_lo] != null ? Math.round(row[C.kwh_min_lo]) : '',
                    row[C.kwh_min_hi] != null ? Math.round(row[C.kwh_min_hi]) : '',
                    row[C.kwh_max] != null ? Math.round(row[C.kwh_max]) : '',
                    row[C.kwh_max_sd] != null ? Math.round(row[C.kwh_max_sd]) : '',
                    row[C.kwh_max_lo] != null ? Math.round(row[C.kwh_max_lo]) : '',
                    row[C.kwh_max_hi] != null ? Math.round(row[C.kwh_max_hi]) : '',
                    row[C.dy] != null ? row[C.dy].toFixed(2) : '',
                    row[C.dy_sd] != null ? row[C.dy_sd].toFixed(2) : '',
                    row[C.dy_lo] != null ? row[C.dy_lo].toFixed(2) : '',
                    row[C.dy_hi] != null ? row[C.dy_hi].toFixed(2) : '',
                    row[C.pr_min] != null ? Math.round(row[C.pr_min]) : '',
                    row[C.pr_max] != null ? Math.round(row[C.pr_max]) : '',
                    viable
                ];
                csv += vals.join(',') + '\n';
            }

            // Trigger download
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const now = new Date();
            a.href = url;
            a.download = 'solar_irrigation_' + crop + '_' + fert + '_' + now.toISOString().slice(0, 10) + '.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        } catch (err) {
            console.error('[Export] CSV generation failed:', err);
            alert('CSV export failed. Please try again.');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    return { init };
})();
