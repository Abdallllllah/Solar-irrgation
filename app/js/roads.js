/**
 * roads.js — Road network overlay layer for Rwanda & Kenya.
 * Loads GeoJSON road data and renders paved/unpaved lines on the map.
 * Provides distance-to-nearest-paved-road lookup by coordinates.
 */
const Roads = (() => {
    'use strict';

    let roadDistances = null;   // {cell_index_str: distance_km}
    let coordLookup = null;     // {"lat,lon": distance_km} for fast tooltip lookup
    let isVisible = false;
    let loadedCountry = null;
    let mapInstance = null;

    const ROAD_FILES = {
        'Rwanda': 'data/roads_rw.geojson',
        'Kenya': 'data/roads_ky.geojson'
    };

    const PAVED_COLOR = '#10b981';
    const UNPAVED_COLOR = '#f59e0b';

    async function init(map, allData) {
        mapInstance = map;

        // Load distance data
        try {
            const res = await fetch('data/road_distances.json');
            if (res.ok) {
                roadDistances = await res.json();
                console.log(`[Roads] Loaded distances for ${Object.keys(roadDistances).length.toLocaleString()} cells`);

                // Build coordinate lookup for tooltip access
                if (allData) {
                    coordLookup = {};
                    for (const [idxStr, dist] of Object.entries(roadDistances)) {
                        const idx = parseInt(idxStr);
                        if (idx < allData.length) {
                            const row = allData[idx];
                            const key = row[Utils.COL.lat] + ',' + row[Utils.COL.lon];
                            coordLookup[key] = dist;
                        }
                    }
                    console.log(`[Roads] Built coordinate lookup: ${Object.keys(coordLookup).length} entries`);
                }

                // Show the distance note
                const note = document.getElementById('road-distance-note');
                if (note) note.style.display = 'block';
            }
        } catch (e) {
            console.warn('[Roads] road_distances.json not found:', e);
        }

        // Setup toggle
        const toggle = document.getElementById('road-toggle');
        if (toggle) {
            toggle.addEventListener('change', () => {
                isVisible = toggle.checked;
                updateVisibility();
            });
        }
    }

    async function loadCountry(countryName) {
        if (!mapInstance) return;
        if (!ROAD_FILES[countryName]) {
            removeLayer();
            loadedCountry = null;
            return;
        }
        if (loadedCountry === countryName) return;

        removeLayer();

        console.log(`[Roads] Loading ${countryName} roads...`);
        try {
            const res = await fetch(ROAD_FILES[countryName]);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const geojson = await res.json();
            console.log(`[Roads] Loaded ${geojson.features.length.toLocaleString()} road segments`);

            mapInstance.addSource('roads', { type: 'geojson', data: geojson });

            // Unpaved layer (dashed, below paved)
            mapInstance.addLayer({
                id: 'roads-unpaved',
                type: 'line',
                source: 'roads',
                filter: ['==', ['get', 'p'], 0],
                layout: {
                    'line-cap': 'round',
                    'line-join': 'round',
                    'visibility': isVisible ? 'visible' : 'none'
                },
                paint: {
                    'line-color': UNPAVED_COLOR,
                    'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 8, 1.5, 12, 3],
                    'line-opacity': 0.7,
                    'line-dasharray': [2, 2]
                }
            });

            // Paved layer (solid, on top)
            mapInstance.addLayer({
                id: 'roads-paved',
                type: 'line',
                source: 'roads',
                filter: ['==', ['get', 'p'], 1],
                layout: {
                    'line-cap': 'round',
                    'line-join': 'round',
                    'visibility': isVisible ? 'visible' : 'none'
                },
                paint: {
                    'line-color': PAVED_COLOR,
                    'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.8, 8, 2, 12, 4],
                    'line-opacity': 0.85
                }
            });

            loadedCountry = countryName;
        } catch (e) {
            console.warn(`[Roads] Failed to load ${countryName}:`, e);
        }
    }

    function removeLayer() {
        if (!mapInstance) return;
        try {
            if (mapInstance.getLayer('roads-paved')) mapInstance.removeLayer('roads-paved');
            if (mapInstance.getLayer('roads-unpaved')) mapInstance.removeLayer('roads-unpaved');
            if (mapInstance.getSource('roads')) mapInstance.removeSource('roads');
        } catch (e) { /* ignore */ }
    }

    function updateVisibility() {
        if (!mapInstance) return;
        const vis = isVisible ? 'visible' : 'none';
        try {
            if (mapInstance.getLayer('roads-paved')) mapInstance.setLayoutProperty('roads-paved', 'visibility', vis);
            if (mapInstance.getLayer('roads-unpaved')) mapInstance.setLayoutProperty('roads-unpaved', 'visibility', vis);
        } catch (e) { /* ignore */ }

        const legend = document.getElementById('road-legend');
        if (legend) legend.style.display = isVisible ? 'flex' : 'none';
    }

    function getDistance(cellIndex) {
        if (!roadDistances) return null;
        const d = roadDistances[String(cellIndex)];
        return d != null ? d : null;
    }

    function getDistanceByCoords(lat, lon) {
        if (!coordLookup) return null;
        const key = lat + ',' + lon;
        const d = coordLookup[key];
        return d != null ? d : null;
    }

    function hasData() { return coordLookup != null; }
    function isShowing() { return isVisible; }

    return { init, loadCountry, getDistance, getDistanceByCoords, hasData, isShowing, updateVisibility };
})();
