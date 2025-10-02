// src/App.jsx
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "maplibre-gl/dist/maplibre-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";

const BACKEND_BASE = "http://localhost:8000";

function debounce(fn, wait) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function bboxFromMap(map) {
  const b = map.getBounds();
  const north = b.getNorth();
  const south = b.getSouth();
  const east = b.getEast();
  const west = b.getWest();
  return `${west},${south},${east},${north}`;
}

export default function App() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const drawRef = useRef(null);
  const [status, setStatus] = useState("Ready");

  useEffect(() => {
    if (mapRef.current) return;
    window.mapboxgl = maplibregl;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: [101.6869, 3.139],
      zoom: 12,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: false, point: false, trash: true },
      defaultMode: "simple_select",
    });
    drawRef.current = draw;
    map.addControl(draw, "top-left");

    map.on("load", async () => {
      if (!map.getSource("features")) {
        map.addSource("features", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      }
      if (!map.getLayer("features-fill")) {
        map.addLayer({
          id: "features-fill",
          type: "fill",
          source: "features",
          paint: { "fill-color": "#00aa88", "fill-opacity": 0.35 },
          filter: ["==", "$type", "Polygon"],
        });
        map.addLayer({
          id: "features-line",
          type: "line",
          source: "features",
          paint: { "line-color": "#007f66", "line-width": 2 },
          filter: ["==", "$type", "Polygon"],
        });
        map.addLayer({
          id: "features-point",
          type: "circle",
          source: "features",
          paint: { "circle-radius": 6, "circle-color": "#ff3333" },
          filter: ["==", "$type", "Point"],
        });
      }

      // initial load for current viewport
      await fetchFeaturesForView(map, draw);

      // debounced fetch on moveend/zoomend
      const debounced = debounce(() => fetchFeaturesForView(map, draw), 250);
      map.on("moveend", debounced);
      map.on("zoomend", debounced);
    });

    function syncPreview() {
      const data = draw.getAll() || { type: "FeatureCollection", features: [] };
      const src = map.getSource("features");
      if (src) src.setData(data);
    }
    map.on("draw.create", syncPreview);
    map.on("draw.update", syncPreview);
    map.on("draw.delete", syncPreview);

    mapRef.current = map;
    return () => {
      try { mapRef.current.remove(); } catch (e) {}
      mapRef.current = null;
    };
  }, []);

  // fetch features that intersect current map view
  async function fetchFeaturesForView(map, draw) {
    setStatus("Loading features for viewport...");
    try {
      const bbox = bboxFromMap(map);
      const res = await fetch(`${BACKEND_BASE}/api/features?bbox=${bbox}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const fc = await res.json();
      if (map.getSource("features")) map.getSource("features").setData(fc);

      // sync draw: clear and add features so they are editable
      if (draw) {
        const existing = draw.getAll();
        existing.features.forEach(f => {
          try { draw.delete(f.id); } catch (e) {}
        });
        if (fc.features && fc.features.length) {
          fc.features.forEach(f => {
            if (f.id === undefined || f.id === null) f.id = 'f_' + Date.now() + '_' + Math.floor(Math.random()*10000);
            try { draw.add(f); } catch (e) {}
          });
        }
      }
      setStatus(`Loaded ${fc.features.length} features`);
    } catch (err) {
      console.error("fetchFeaturesForView error:", err);
      setStatus("Failed to load viewport features");
    }
  }

  // save everything currently in draw to backend (simple overwrite)
  async function saveToBackend() {
    const draw = drawRef.current;
    if (!draw) return alert("Draw not ready");
    const data = draw.getAll() || { type: "FeatureCollection", features: [] };
    setStatus("Saving to backend...");
    try {
      const res = await fetch(`${BACKEND_BASE}/api/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus("Saved to backend");
      // reload view after save
      const map = mapRef.current;
      await fetchFeaturesForView(map, draw);
    } catch (err) {
      console.error("Save failed:", err);
      setStatus("Save failed");
      alert("Save failed — check console");
    }
  }

  // UI actions
  const startPolygon = () => drawRef.current?.changeMode("draw_polygon");
  const startPoint = () => drawRef.current?.changeMode("draw_point");
  const stopDrawing = () => drawRef.current?.changeMode("simple_select");

  return (
    <div style={{height: "100vh", display: "flex", flexDirection: "column"}}>
      <div style={{padding: 8, display: "flex", gap: 8, alignItems: "center"}}>
        <button onClick={startPolygon}>Start polygon</button>
        <button onClick={startPoint}>Start point</button>
        <button onClick={stopDrawing}>Stop</button>
        <button onClick={saveToBackend}>Save to backend</button>
        <div style={{marginLeft: "auto", color: "#666"}}>{status}</div>
      </div>
      <div ref={mapContainer} style={{flex: 1}} />
    </div>
  );
}