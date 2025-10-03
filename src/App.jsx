// src/App.jsx
import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";
import "maplibre-gl/dist/maplibre-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import "./App.css";

export default function App() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const drawRef = useRef(null);
  const fileInputRef = useRef(null);

  const [status, setStatus] = useState("Loading Tenom City Planner...");
  const [scenarios, setScenarios] = useState(["Master Plan", "Sustainable Vision"]);
  const [currentScenario, setCurrentScenario] = useState("Master Plan");
  const [analysisData, setAnalysisData] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTool, setActiveTool] = useState("select");
  
  const [layers, setLayers] = useState({
    population: { visible: true, name: "Population Density", color: "#10b981" },
    floodRisk: { visible: true, name: "Flood Risk", color: "#3b82f6" },
    vegetation: { visible: true, name: "Vegetation", color: "#22c55e" },
    heatRisk: { visible: false, name: "Heat Risk", color: "#ef4444" }
  });

  const mockAnalysisData = {
    scores: {
      environmental: 72,
      wellbeing: 68,
      economic: 61,
      hazard: 25
    },
    recommendations: [
      { type: 'success', text: 'Good green space distribution', priority: 'low', icon: '🌿' },
      { type: 'warning', text: 'Consider flood drainage in northern zone', priority: 'medium', icon: '💧' },
      { type: 'error', text: 'High heat island effect in commercial area', priority: 'high', icon: '🌡️' }
    ]
  };

  // SIMPLE MAP INITIALIZATION - GUARANTEED TO WORK
  useEffect(() => {
    console.log("Starting map initialization...");
    
    if (!mapContainer.current) {
      console.error("Map container not found!");
      return;
    }

    if (mapRef.current) {
      console.log("Map already exists");
      return;
    }

    try {
      console.log("Creating map instance...");
      
      // Create the map with basic OSM tiles - SIMPLE VERSION THAT WORKS
      const map = new maplibregl.Map({
        container: mapContainer.current,
        style: {
          version: 8,
          sources: {
            'osm': {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '© OpenStreetMap Contributors'
            }
          },
          layers: [{
            id: 'osm',
            type: 'raster',
            source: 'osm'
          }]
        },
        center: [115.9, 5.1],
        zoom: 12
      });

      console.log("Map instance created, adding controls...");

      // Add navigation controls
      map.addControl(new maplibregl.NavigationControl());

      // Add drawing tools - SIMPLE VERSION
      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {
          polygon: true,
          line_string: true,
          point: true,
          trash: true
        }
      });
      
      map.addControl(draw);
      drawRef.current = draw;
      mapRef.current = map;

      // Set up event listeners
      map.on('load', () => {
        console.log("Map loaded successfully!");
        setStatus("Map ready - Start planning your city!");
      });

      map.on('error', (e) => {
        console.error("Map error:", e);
        setStatus("Map loading failed");
      });

      map.on('draw.create', () => {
        const features = draw.getAll();
        setStatus(`Drawn ${features.features.length} objects`);
      });

      map.on('draw.update', () => {
        const features = draw.getAll();
        setStatus(`Updated ${features.features.length} objects`);
      });

      map.on('draw.delete', () => {
        const features = draw.getAll();
        setStatus(`${features.features.length} objects remaining`);
      });
      
    } catch (error) {
      console.error("Error creating map:", error);
      setStatus("Failed to create map");
    }

    // Cleanup
    return () => {
      if (mapRef.current) {
        console.log("Removing map...");
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  const handleToolClick = (tool) => {
    setActiveTool(tool);
    if (drawRef.current) {
      if (tool === 'select') {
        drawRef.current.changeMode('simple_select');
        setStatus("Select mode - click objects to edit");
      } else {
        drawRef.current.changeMode(`draw_${tool}`);
        setStatus(`Drawing ${tool} - click on map to start`);
      }
    }
  };

  const toggleLayer = (layerId) => {
    setLayers(prev => ({
      ...prev,
      [layerId]: {
        ...prev[layerId],
        visible: !prev[layerId].visible
      }
    }));
  };

  const handleExport = () => {
    const draw = drawRef.current;
    if (!draw) return;
    
    const data = draw.getAll();
    if (data.features.length === 0) {
      setStatus("No features to export");
      return;
    }

    const geoJson = {
      type: 'FeatureCollection',
      features: data.features
    };

    const blob = new Blob([JSON.stringify(geoJson, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tenom-plan-${currentScenario}.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus(`Exported ${data.features.length} features`);
  };

  const handleImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const geoJson = JSON.parse(e.target.result);
        const draw = drawRef.current;
        if (draw && geoJson.features) {
          draw.deleteAll();
          geoJson.features.forEach(feature => {
            draw.add(feature);
          });
          setStatus(`Imported ${geoJson.features.length} features`);
        }
      } catch (error) {
        setStatus("Error: Invalid GeoJSON file");
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const analyzeNow = async () => {
    const draw = drawRef.current;
    if (!draw) return;
    
    const features = draw.getAll();
    if (features.features.length === 0) {
      setStatus("Draw some features first to analyze");
      return;
    }
    
    setIsAnalyzing(true);
    setStatus("Analyzing your urban plan...");
    
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      setAnalysisData(mockAnalysisData);
      setStatus("Analysis complete!");
    } catch (e) {
      setStatus("Analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const createNewScenario = () => {
    const scenarioName = prompt("Enter new scenario name:");
    if (scenarioName && !scenarios.includes(scenarioName)) {
      setScenarios([...scenarios, scenarioName]);
      setCurrentScenario(scenarioName);
      if (drawRef.current) {
        drawRef.current.deleteAll();
      }
      setAnalysisData(null);
      setStatus(`New scenario: ${scenarioName}`);
    }
  };

  const switchScenario = (scenario) => {
    setCurrentScenario(scenario);
    setAnalysisData(null);
    if (drawRef.current) {
      drawRef.current.deleteAll();
    }
    setStatus(`Switched to ${scenario}`);
  };

  const clearMap = () => {
    if (drawRef.current) {
      drawRef.current.deleteAll();
      setStatus("Map cleared");
    }
  };

  // Chart data
  const zoneChartData = analysisData ? [
    { zone: 'Residential', environmental: 75, wellbeing: 80, hazard: 15 },
    { zone: 'Commercial', environmental: 60, wellbeing: 65, hazard: 40 },
    { zone: 'Industrial', environmental: 55, wellbeing: 50, hazard: 30 }
  ] : [];

  return (
    <div className="app">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <div className="logo-icon">🏙️</div>
            <div className="logo-text">
              <h1>Tenom Planner</h1>
              <p>Urban Intelligence Platform</p>
            </div>
          </div>
        </div>

        <div className="sidebar-content">
          {/* Scenario Section */}
          <div className="sidebar-section">
            <div className="section-header">
              <h3>Scenarios</h3>
              <button className="icon-btn" onClick={createNewScenario} title="New Scenario">
                +
              </button>
            </div>
            <select 
              value={currentScenario}
              onChange={(e) => switchScenario(e.target.value)}
              className="scenario-select"
            >
              {scenarios.map(scenario => (
                <option key={scenario} value={scenario}>{scenario}</option>
              ))}
            </select>
          </div>

          {/* Tools Section */}
          <div className="sidebar-section">
            <div className="section-header">
              <h3>Planning Tools</h3>
            </div>
            <div className="tools-grid">
              <button 
                className={`tool-btn ${activeTool === 'select' ? 'active' : ''}`}
                onClick={() => handleToolClick('select')}
              >
                <span className="tool-icon">↦</span>
                <span className="tool-label">Select</span>
              </button>
              <button 
                className={`tool-btn ${activeTool === 'polygon' ? 'active' : ''}`}
                onClick={() => handleToolClick('polygon')}
              >
                <span className="tool-icon">▰</span>
                <span className="tool-label">Zone</span>
              </button>
              <button 
                className={`tool-btn ${activeTool === 'line_string' ? 'active' : ''}`}
                onClick={() => handleToolClick('line_string')}
              >
                <span className="tool-icon">╱</span>
                <span className="tool-label">Road</span>
              </button>
              <button 
                className={`tool-btn ${activeTool === 'point' ? 'active' : ''}`}
                onClick={() => handleToolClick('point')}
              >
                <span className="tool-icon">•</span>
                <span className="tool-label">Point</span>
              </button>
            </div>
          </div>

          {/* Layers Section */}
          <div className="sidebar-section">
            <div className="section-header">
              <h3>Data Layers</h3>
            </div>
            <div className="layers-list">
              {Object.entries(layers).map(([layerId, layer]) => (
                <div key={layerId} className="layer-item">
                  <label className="layer-toggle">
                    <input
                      type="checkbox"
                      checked={layer.visible}
                      onChange={() => toggleLayer(layerId)}
                    />
                    <span className="checkmark"></span>
                    <span 
                      className="layer-color"
                      style={{ backgroundColor: layer.color }}
                    ></span>
                    <span className="layer-name">{layer.name}</span>
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Actions Section */}
          <div className="sidebar-section">
            <div className="section-header">
              <h3>Actions</h3>
            </div>
            <div className="actions-grid">
              <button 
                className="action-btn primary"
                onClick={analyzeNow}
                disabled={isAnalyzing}
              >
                <span className="action-icon">📊</span>
                <span className="action-label">
                  {isAnalyzing ? 'Analyzing...' : 'AI Analysis'}
                </span>
              </button>
              
              <button 
                className="action-btn"
                onClick={handleExport}
              >
                <span className="action-icon">💾</span>
                <span className="action-label">Export</span>
              </button>
              
              <button 
                className="action-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                <span className="action-icon">📁</span>
                <span className="action-label">Import</span>
              </button>
              
              <button 
                className="action-btn"
                onClick={clearMap}
              >
                <span className="action-icon">🗑️</span>
                <span className="action-label">Clear</span>
              </button>
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              accept=".geojson,.json"
              onChange={handleImport}
              style={{ display: "none" }}
            />
          </div>

          {/* Analysis Results */}
          {analysisData && (
            <div className="sidebar-section analysis-results">
              <div className="section-header">
                <h3>Analysis Results</h3>
              </div>
              
              <div className="score-cards">
                <div className="score-card environmental">
                  <div className="score-value">{analysisData.scores.environmental}</div>
                  <div className="score-label">Environmental</div>
                </div>
                <div className="score-card wellbeing">
                  <div className="score-value">{analysisData.scores.wellbeing}</div>
                  <div className="score-label">Wellbeing</div>
                </div>
                <div className="score-card economic">
                  <div className="score-value">{analysisData.scores.economic}</div>
                  <div className="score-label">Economic</div>
                </div>
                <div className="score-card hazard">
                  <div className="score-value">{analysisData.scores.hazard}</div>
                  <div className="score-label">Hazard</div>
                </div>
              </div>

              {/* Zone Analysis Chart */}
              <div className="chart-container">
                <h4>Zone Performance</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={zoneChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="zone" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="environmental" fill="#10b981" name="Environmental" />
                    <Bar dataKey="wellbeing" fill="#3b82f6" name="Wellbeing" />
                    <Bar dataKey="hazard" fill="#ef4444" name="Hazard Risk" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Recommendations */}
              <div className="recommendations">
                <h4>AI Recommendations</h4>
                {analysisData.recommendations.map((rec, index) => (
                  <div key={index} className={`recommendation ${rec.type}`}>
                    <div className="rec-icon">{rec.icon}</div>
                    <div className="rec-content">
                      <div className="rec-text">{rec.text}</div>
                      <div className="rec-priority">{rec.priority} priority</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="sidebar-footer">
          <div className="status">{status}</div>
        </div>
      </div>

      {/* Main Map Area - SIMPLE VERSION THAT WORKS */}
      <div className="map-area">
        <div 
          ref={mapContainer} 
          className="map-container"
        />
      </div>
    </div>
  );
}
