import React, { useState, useRef, useEffect } from "react";
import {
  Upload,
  Ruler,
  Maximize2,
  Trash2,
  Plus,
  Compass,
  FileText,
  Layers,
  Sparkles,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  ChevronRight,
  Calculator,
  Download,
  Info,
  CheckCircle2,
  Sliders,
  HelpCircle,
  Scissors
} from "lucide-react";
import { Point, Room, ScaleCalibration, AiAnalysisResult, ToolType, UnitSystem } from "./types";
import {
  calculatePolygonPixelArea,
  calculateDistance,
  generateId,
  generatePastelColor,
  fileToBase64,
  formatArea,
  sqmToSqft,
  sqftToSqm
} from "./utils";

// Sample base64 floor plan so users can try it immediately without a file
import { SAMPLE_FLOOR_PLANS } from "./sample_plans";

export default function App() {
  // Application state
  const [imageUrl, setImageUrl] = useState<string>(SAMPLE_FLOOR_PLANS[0].url);
  const [imageMime, setImageMime] = useState<string>("image/jpeg");
  const [imageSize, setImageSize] = useState<{ width: number; height: number }>({ width: 1200, height: 900 });
  const [fileName, setFileName] = useState<string>("Modern_Villa_Ground_Plan.jpg");
  const [fileLoading, setFileLoading] = useState<boolean>(false);

  // Calibration and Tracing states
  const [activeTool, setActiveTool] = useState<ToolType>("select");
  const [unitSystem, setUnitSystem] = useState<UnitSystem>("metric"); // metric (m) or imperial (ft)
  const [scale, setScale] = useState<ScaleCalibration>({
    pixelLength: 0,
    realLength: 0,
    unit: "meters",
    isCalibrated: false,
    points: null,
  });

  // SVG Custom Traced Rooms
  const [rooms, setRooms] = useState<Room[]>([
    {
      id: "sample-living",
      name: "Living Room (Sample Traced)",
      points: [
        { x: 100, y: 150 },
        { x: 450, y: 150 },
        { x: 450, y: 480 },
        { x: 100, y: 480 }
      ],
      area: 32.5,
      color: "hsla(140, 65%, 72%, 0.4)",
      isAiDetected: false,
      dimensionsText: "Estimated",
      notes: "Auto-loaded sample room"
    },
    {
      id: "sample-kitchen",
      name: "Kitchen & Dining (Sample Traced)",
      points: [
        { x: 480, y: 150 },
        { x: 800, y: 150 },
        { x: 800, y: 400 },
        { x: 480, y: 400 }
      ],
      area: 18.2,
      color: "hsla(30, 65%, 72%, 0.4)",
      isAiDetected: false,
      dimensionsText: "Estimated",
      notes: "Auto-loaded sample kitchen area"
    }
  ]);

  const [currentTracePoints, setCurrentTracePoints] = useState<Point[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  // Temp points for scale calibration drag/click
  const [tempCalibrationPoints, setTempCalibrationPoints] = useState<Point[]>([]);
  const [calibrationInputVal, setCalibrationInputVal] = useState<string>("5");
  const [showCalibrationModal, setShowCalibrationModal] = useState<boolean>(false);

  // AI-Assisted Analysis states
  const [aiResult, setAiResult] = useState<AiAnalysisResult | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [useAiForTotal, setUseAiForTotal] = useState<boolean>(false);

  // View state (Pan & Zoom)
  const [zoom, setZoom] = useState<number>(0.8);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const workspaceRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Handle unit system changes
  useEffect(() => {
    // Sync scale calibration physical unit when user toggles unit system
    setScale((prev) => {
      if (!prev.isCalibrated) return prev;
      const targetUnit = unitSystem === "metric" ? "meters" : "feet";
      if (prev.unit === targetUnit) return prev;

      // Convert calibration values
      const factor = unitSystem === "metric" ? 0.3048 : 3.28084;
      const newRealLength = parseFloat((prev.realLength * factor).toFixed(2));
      return {
        ...prev,
        realLength: newRealLength,
        unit: targetUnit,
      };
    });

    // Convert room areas of custom traced rooms
    setRooms((prevRooms) =>
      prevRooms.map((r) => {
        const convertedArea = unitSystem === "metric" ? sqftToSqm(r.area) : sqmToSqft(r.area);
        return {
          ...r,
          area: parseFloat(convertedArea.toFixed(2)),
        };
      })
    );
  }, [unitSystem]);

  // Set default calibrated scale for sample floor plan so it works out of the box
  useEffect(() => {
    if (imageUrl === SAMPLE_FLOOR_PLANS[0].url) {
      setScale({
        pixelLength: 350,
        realLength: 8.5,
        unit: unitSystem === "metric" ? "meters" : "feet",
        isCalibrated: true,
        points: [
          { x: 100, y: 150 },
          { x: 450, y: 150 },
        ],
      });
    }
  }, [imageUrl]);

  // Load selected sample plan
  const handleLoadSample = (sample: typeof SAMPLE_FLOOR_PLANS[0]) => {
    setImageUrl(sample.url);
    setImageMime("image/jpeg");
    setFileName(sample.name);
    setAiResult(null);
    setAiError(null);
    setRooms([]);
    setZoom(0.8);
    setPan({ x: 0, y: 0 });
    // If it's a sample, set scale calibration automatically so they can draw immediately
    setScale({
      pixelLength: 350,
      realLength: sample.id === "villa" ? 8.5 : 12,
      unit: unitSystem === "metric" ? "meters" : "feet",
      isCalibrated: true,
      points: [
        { x: 100, y: 150 },
        { x: 450, y: 150 },
      ],
    });
  };

  // Handle custom plan file upload (supports images & PDF)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileLoading(true);
    setFileName(file.name);
    setAiResult(null);
    setAiError(null);
    setSelectedRoomId(null);
    setRooms([]);
    setCurrentTracePoints([]);
    setScale({ pixelLength: 0, realLength: 0, unit: unitSystem === "metric" ? "meters" : "feet", isCalibrated: false, points: null });

    try {
      const base64Str = await fileToBase64(file);
      setImageMime(file.type);
      setImageUrl(base64Str);

      // Trigger automatic scaling notification
      setActiveTool("calibrate");
    } catch (err) {
      console.error(err);
      alert("Failed to load file. Please try a standard image format (PNG, JPG, WEBP).");
    } finally {
      setFileLoading(false);
    }
  };

  // Image load helper to fetch original dimensions
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
  };

  // Trigger Gemini AI plan analyzer backend API
  const handleAiAnalyze = async () => {
    if (!imageUrl) return;
    setAiLoading(true);
    setAiError(null);

    try {
      const response = await fetch("/api/analyze-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileData: imageUrl,
          mimeType: imageMime,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || "Backend analysis failed");
      }

      const result: AiAnalysisResult = await response.json();
      if (!result.success) {
        throw new Error(result.summary || "AI could not properly process the floor plan.");
      }

      // Merge and align with user setting
      if (result.dominantUnit === "feet" && unitSystem === "metric") {
        setUnitSystem("metric");
      } else if (result.dominantUnit === "meters" && unitSystem === "imperial") {
        setUnitSystem("imperial");
      }

      setAiResult(result);
      setUseAiForTotal(true); // Default to AI areas if they are returned successfully
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || "Failed to communicate with the plan analysis server.");
    } finally {
      setAiLoading(false);
    }
  };

  // Translate client mouse coordinates to absolute floor plan image coordinates
  const getPlanCoords = (e: React.MouseEvent<SVGSVGElement>): Point => {
    if (!imageRef.current) return { x: 0, y: 0 };
    const rect = imageRef.current.getBoundingClientRect();

    // Calculate ratio relative to actual rendering size inside the browser
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    // Convert to original natural image scale
    const x = Math.round((clientX / rect.width) * imageSize.width);
    const y = Math.round((clientY / rect.height) * imageSize.height);

    return { x, y };
  };

  // Handle Workspace interaction click events
  const handleWorkspaceClick = (e: React.MouseEvent<SVGSVGElement>) => {
    // If panning is active, skip click behaviors
    if (activeTool === "select" || isPanning) return;

    const point = getPlanCoords(e);

    if (activeTool === "calibrate") {
      const newPoints = [...tempCalibrationPoints, point];
      if (newPoints.length === 1) {
        setTempCalibrationPoints(newPoints);
      } else if (newPoints.length === 2) {
        setTempCalibrationPoints(newPoints);
        setShowCalibrationModal(true);
      }
    } else if (activeTool === "trace") {
      // Add point to active tracing polygon
      setCurrentTracePoints((prev) => [...prev, point]);
    }
  };

  // Complete calibration distance submission
  const handleCalibrateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const length = parseFloat(calibrationInputVal);
    if (isNaN(length) || length <= 0 || tempCalibrationPoints.length < 2) return;

    const p1 = tempCalibrationPoints[0];
    const p2 = tempCalibrationPoints[1];
    const pixelDist = calculateDistance(p1, p2);

    setScale({
      pixelLength: pixelDist,
      realLength: length,
      unit: unitSystem === "metric" ? "meters" : "feet",
      isCalibrated: true,
      points: [p1, p2],
    });

    // Reset calibration tools
    setTempCalibrationPoints([]);
    setShowCalibrationModal(false);
    setActiveTool("trace"); // Prompt user to start tracing zones now!
  };

  // Reset scale calibration
  const handleResetCalibration = () => {
    setScale({
      pixelLength: 0,
      realLength: 0,
      unit: unitSystem === "metric" ? "meters" : "feet",
      isCalibrated: false,
      points: null,
    });
    setTempCalibrationPoints([]);
  };

  // Finish room boundary tracing and save polygon area
  const handleFinishTracing = () => {
    if (currentTracePoints.length < 3) {
      alert("A room must have at least 3 points to form a polygon area.");
      return;
    }

    if (!scale.isCalibrated) {
      alert("Please calibrate the drawing scale first to calculate the real-world physical area!");
      return;
    }

    // Calculate pixel area
    const pixelArea = calculatePolygonPixelArea(currentTracePoints);

    // Convert pixel area to physical area
    // Scale factor = physical length / pixel distance
    const scaleFactor = scale.realLength / scale.pixelLength;
    const physicalAreaFactor = Math.pow(scaleFactor, 2);
    const physicalArea = parseFloat((pixelArea * physicalAreaFactor).toFixed(2));

    const newRoom: Room = {
      id: generateId(),
      name: `Room ${rooms.length + 1}`,
      points: currentTracePoints,
      area: physicalArea,
      color: generatePastelColor(),
      isAiDetected: false,
      dimensionsText: `${currentTracePoints.length} points`,
    };

    setRooms((prev) => [...prev, newRoom]);
    setCurrentTracePoints([]);
    setSelectedRoomId(newRoom.id);
  };

  // Delete a traced room zone
  const handleDeleteRoom = (id: string) => {
    setRooms((prev) => prev.filter((r) => r.id !== id));
    if (selectedRoomId === id) setSelectedRoomId(null);
  };

  // Update room attributes inline
  const handleUpdateRoomName = (id: string, newName: string) => {
    setRooms((prev) =>
      prev.map((r) => (r.id === id ? { ...r, name: newName } : r))
    );
  };

  // Calculate sum of custom-traced areas
  const totalTracedArea = rooms.reduce((sum, r) => sum + r.area, 0);

  // Computed total showing on high level
  const totalAreaValue = useAiForTotal && aiResult ? aiResult.totalArea : totalTracedArea;
  const currentUnitSuffix = unitSystem === "metric" ? "sqm" : "sqft";

  // Mouse wheel Zoom handler
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    const newZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;
    setZoom(Math.min(Math.max(newZoom, 0.2), 6));
  };

  // Drag workspace layout to pan (Middle click or select pan tool)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (activeTool === "select" || e.button === 1 || e.shiftKey) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Format dynamic display summary of scale calibration
  const scaleDisplayString = () => {
    if (!scale.isCalibrated) return "Not Calibrated";
    const unitLabel = scale.unit === "meters" ? "m" : "ft";
    return `${scale.realLength} ${unitLabel} = ${Math.round(scale.pixelLength)}px`;
  };

  return (
    <div className="flex flex-col h-screen bg-[#0f172a] text-[#f1f5f9] font-sans antialiased overflow-hidden">
      {/* Top Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-[#1e293b] border-b border-[#334155] shrink-0 shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-blue-600 rounded-xl text-white shadow-md shadow-blue-500/20">
            <Calculator className="h-6 w-6" id="header-logo-icon" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              Floor Plan Area Calculator
              <span className="text-xs bg-[#334155] text-blue-400 px-2 py-0.5 rounded-full font-normal border border-blue-500/10">
                Desktop Suite
              </span>
            </h1>
            <p className="text-xs text-slate-400">Calculate room boundaries and total floor space with pixel precision & AI</p>
          </div>
        </div>

        {/* Global Toolbar Controls */}
        <div className="flex items-center space-x-4">
          {/* Unit Toggle */}
          <div className="flex items-center bg-[#0f172a] p-1 rounded-lg border border-[#334155]">
            <button
              onClick={() => setUnitSystem("metric")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                unitSystem === "metric"
                  ? "bg-blue-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Metric (m, m²)
            </button>
            <button
              onClick={() => setUnitSystem("imperial")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                unitSystem === "imperial"
                  ? "bg-blue-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Imperial (ft, sq ft)
            </button>
          </div>

          {/* Sample loader */}
          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-400 font-medium">Load Sample Plan:</span>
            {SAMPLE_FLOOR_PLANS.map((sample) => (
              <button
                key={sample.id}
                onClick={() => handleLoadSample(sample)}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors border ${
                  fileName === sample.name
                    ? "bg-slate-700 border-blue-500 text-white"
                    : "bg-[#0f172a] border-[#334155] text-slate-300 hover:bg-slate-800"
                }`}
              >
                {sample.name.split(".")[0].replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Desktop Container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Control Bar (File upload, Tools & Custom Tracing) */}
        <div className="w-80 bg-[#1e293b] border-r border-[#334155] flex flex-col overflow-y-auto shrink-0 p-5 space-y-6">
          {/* Section 1: Upload House Plan */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Upload className="w-3.5 h-3.5 text-blue-400" />
              1. Import Blueprints
            </h3>
            <div className="relative group border-2 border-dashed border-[#475569] hover:border-blue-500 rounded-xl p-4 transition-all text-center bg-[#0f172a]/50">
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none">
                <Upload className="w-8 h-8 text-slate-400 group-hover:text-blue-400 transition-colors" />
                <span className="text-xs font-semibold text-slate-300">Choose plan drawing</span>
                <span className="text-[10px] text-slate-500 block">PNG, JPG, WEBP, or PDF</span>
              </div>
            </div>

            {fileName && (
              <div className="flex items-center justify-between p-2.5 bg-[#0f172a] rounded-lg border border-[#334155] text-xs">
                <div className="flex items-center space-x-2 truncate">
                  <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="truncate text-slate-300 font-medium">{fileName}</span>
                </div>
                <span className="text-[10px] text-slate-500 shrink-0 bg-[#1e293b] px-1.5 py-0.5 rounded border border-[#334155]">
                  {imageSize.width}x{imageSize.height} px
                </span>
              </div>
            )}
          </div>

          {/* Section 2: Scale & Trace Tool Suite */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Ruler className="w-3.5 h-3.5 text-blue-400" />
              2. Custom Scaling Suite
            </h3>

            {/* Scale state indicator */}
            <div className={`p-3 rounded-lg border text-xs flex flex-col space-y-1.5 ${
              scale.isCalibrated 
                ? "bg-green-950/25 border-green-500/30 text-green-300"
                : "bg-amber-950/25 border-amber-500/30 text-amber-300"
            }`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${scale.isCalibrated ? "bg-green-400 animate-pulse" : "bg-amber-400"}`}></span>
                  {scale.isCalibrated ? "Drawing Calibrated" : "Calibration Needed"}
                </span>
                {scale.isCalibrated && (
                  <button 
                    onClick={handleResetCalibration}
                    className="text-slate-400 hover:text-white hover:bg-[#334155] p-1 rounded transition-colors"
                    title="Recalibrate"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <p className="text-[11px] opacity-80 leading-relaxed">
                {scale.isCalibrated 
                  ? `Defined distance: ${scaleDisplayString()}`
                  : "Calibrate scale to accurately translate drawing pixels into real square footage."}
              </p>
            </div>

            {/* Interactive Drawing Tools */}
            <div className="grid grid-cols-1 gap-2 pt-1">
              <button
                onClick={() => {
                  setActiveTool("calibrate");
                  setTempCalibrationPoints([]);
                }}
                className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                  activeTool === "calibrate"
                    ? "bg-blue-600/10 border-blue-500 text-blue-300"
                    : "bg-[#0f172a] border-[#334155] hover:bg-slate-800 text-slate-300"
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <Ruler className="w-4 h-4 shrink-0 text-blue-400" />
                  <div>
                    <div className="text-xs font-semibold">Calibrate Scale</div>
                    <div className="text-[10px] text-slate-400">Click 2 points on a known length</div>
                  </div>
                </div>
                {scale.isCalibrated && <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />}
              </button>

              <button
                onClick={() => {
                  if (!scale.isCalibrated) {
                    alert("Please calibrate the blueprint scale first using the 'Calibrate Scale' button above!");
                    return;
                  }
                  setActiveTool("trace");
                  setCurrentTracePoints([]);
                }}
                disabled={!scale.isCalibrated}
                className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                  !scale.isCalibrated 
                    ? "opacity-50 cursor-not-allowed bg-slate-900 border-slate-800"
                    : activeTool === "trace"
                    ? "bg-emerald-600/10 border-emerald-500 text-emerald-300"
                    : "bg-[#0f172a] border-[#334155] hover:bg-slate-800 text-slate-300"
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <Scissors className="w-4 h-4 shrink-0 text-emerald-400" />
                  <div>
                    <div className="text-xs font-semibold">Trace Room Zone</div>
                    <div className="text-[10px] text-slate-400">Click room corners to construct polygon</div>
                  </div>
                </div>
                {currentTracePoints.length > 0 && (
                  <span className="text-xs bg-emerald-500 text-slate-900 font-bold px-1.5 py-0.5 rounded-full">
                    {currentTracePoints.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  setActiveTool("select");
                  setCurrentTracePoints([]);
                }}
                className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                  activeTool === "select"
                    ? "bg-slate-700 border-slate-500 text-white"
                    : "bg-[#0f172a] border-[#334155] hover:bg-slate-800 text-slate-300"
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <Compass className="w-4 h-4 shrink-0 text-slate-400" />
                  <div>
                    <div className="text-xs font-semibold">Select / Pan View</div>
                    <div className="text-[10px] text-slate-400">Inspect traced boundaries or move plan</div>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Section 3: Interactive Instruction manual */}
          <div className="bg-[#0f172a] rounded-xl p-3.5 border border-[#334155] space-y-2 text-xs">
            <h4 className="font-semibold text-slate-300 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-blue-400" />
              Quick Workspace Guide:
            </h4>
            <ul className="space-y-1.5 text-slate-400 text-[11px] list-disc list-inside">
              {activeTool === "calibrate" && (
                <>
                  <li className="text-blue-300 font-medium">Click once for the start point</li>
                  <li className="text-blue-300 font-medium">Click again for the end point</li>
                  <li>Enter the physical length of that line to calibrate</li>
                </>
              )}
              {activeTool === "trace" && (
                <>
                  <li className="text-emerald-300 font-medium">Click on each corner of the room</li>
                  <li>Click &quot;Complete Zone&quot; below to close the room</li>
                  <li>You can trace multiple rooms to add them up</li>
                </>
              )}
              {activeTool === "select" && (
                <>
                  <li>Click on any traced room to rename/remove</li>
                  <li>Hold and drag image to inspect specific zones</li>
                  <li>Use zoom controls or scroll wheel to zoom</li>
                </>
              )}
            </ul>
          </div>

          {/* Active Tracing Controls */}
          {activeTool === "trace" && currentTracePoints.length > 0 && (
            <div className="bg-emerald-950/30 border border-emerald-500/25 p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-400">Tracing Room Area...</span>
                <span className="text-xs bg-emerald-900/50 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/20">
                  {currentTracePoints.length} points
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleFinishTracing}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-3 rounded-lg text-xs shadow-lg transition-colors"
                >
                  Complete Zone
                </button>
                <button
                  onClick={() => setCurrentTracePoints([])}
                  className="bg-[#0f172a] hover:bg-slate-800 text-slate-300 py-2 px-3 rounded-lg text-xs border border-[#334155] transition-colors"
                >
                  Clear Points
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Center: Drawing Board with Zoom / Pan Canvas Workspace */}
        <div className="flex-1 bg-[#0f172a] relative flex flex-col overflow-hidden select-none">
          {/* Zoom and Workspace Status Overlay */}
          <div className="absolute top-4 left-4 z-20 flex items-center space-x-2 bg-[#1e293b]/90 backdrop-blur border border-[#334155] p-1.5 rounded-lg shadow-xl">
            <button
              onClick={() => setZoom((z) => Math.min(z + 0.15, 6))}
              className="p-1.5 rounded text-slate-300 hover:bg-[#334155] hover:text-white transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(z - 0.15, 0.2))}
              className="p-1.5 rounded text-slate-300 hover:bg-[#334155] hover:text-white transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setZoom(0.85);
                setPan({ x: 0, y: 0 });
              }}
              className="px-2 py-1 text-[10px] bg-[#0f172a] text-slate-400 hover:text-white rounded border border-[#334155] transition-all"
            >
              Reset view
            </button>
            <div className="h-4 w-[1px] bg-[#334155]" />
            <span className="text-[10px] text-slate-300 font-mono pr-2">Zoom: {Math.round(zoom * 100)}%</span>
          </div>

          <div className="absolute top-4 right-4 z-20 flex items-center space-x-2">
            <span className="text-xs bg-slate-900/90 backdrop-blur border border-[#334155] px-3 py-1.5 rounded-lg text-slate-300 font-medium">
              Mode: <span className="text-blue-400 capitalize">{activeTool}</span>
            </span>
          </div>

          {/* Interactive Workspace Area */}
          <div
            ref={workspaceRef}
            className={`flex-1 relative overflow-hidden flex items-center justify-center ${
              activeTool === "select" ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair"
            }`}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {fileLoading ? (
              <div className="text-center p-8 space-y-3">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto"></div>
                <p className="text-sm text-slate-400">Loading house plan drawing...</p>
              </div>
            ) : (
              <div
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: "center",
                  transition: isPanning ? "none" : "transform 0.15s cubic-bezier(0.2, 0.8, 0.2, 1)",
                }}
                className="relative"
              >
                {/* Background Blueprint Image */}
                <img
                  ref={imageRef}
                  src={imageUrl}
                  alt="House Floor Plan"
                  onLoad={handleImageLoad}
                  className="max-w-none shadow-2xl border-4 border-slate-700 pointer-events-none rounded-sm select-none"
                  style={{ width: `${imageSize.width}px`, height: `${imageSize.height}px` }}
                />

                {/* SVG Tracing Vector Layer Overlay */}
                <svg
                  className="absolute inset-0 w-full h-full"
                  viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
                  onClick={handleWorkspaceClick}
                >
                  {/* Render saved Custom Traced Rooms */}
                  {rooms.map((room) => {
                    const isSelected = room.id === selectedRoomId;
                    return (
                      <g key={room.id} className="group">
                        <polygon
                          points={room.points.map((p) => `${p.x},${p.y}`).join(" ")}
                          fill={room.color}
                          stroke={isSelected ? "#3b82f6" : "#64748b"}
                          strokeWidth={isSelected ? 6 / zoom : 3 / zoom}
                          className="transition-all hover:fill-blue-500/20 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRoomId(room.id);
                          }}
                        />
                        {/* Display area label in the geometric center of the room */}
                        {room.points.length > 0 && (
                          <g
                            transform={`translate(${
                              room.points.reduce((sum, p) => sum + p.x, 0) / room.points.length
                            }, ${
                              room.points.reduce((sum, p) => sum + p.y, 0) / room.points.length
                            })`}
                            className="pointer-events-none"
                          >
                            <rect
                              x={-55}
                              y={-14}
                              width={110}
                              height={28}
                              rx={4}
                              fill="#1e293b"
                              stroke={isSelected ? "#3b82f6" : "#475569"}
                              strokeWidth={1}
                              className="shadow-md"
                            />
                            <text
                              textAnchor="middle"
                              y={-2}
                              fill="#ffffff"
                              fontSize={10}
                              fontWeight="bold"
                            >
                              {room.name}
                            </text>
                            <text
                              textAnchor="middle"
                              y={10}
                              fill="#38bdf8"
                              fontSize={9}
                              fontWeight="bold"
                            >
                              {formatArea(room.area, currentUnitSuffix)}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}

                  {/* Render active Room Tracing lines in-progress */}
                  {currentTracePoints.length > 0 && (
                    <g>
                      {/* Existing lines */}
                      <polyline
                        points={currentTracePoints.map((p) => `${p.x},${p.y}`).join(" ")}
                        fill="rgba(59, 130, 246, 0.15)"
                        stroke="#3b82f6"
                        strokeWidth={4 / zoom}
                      />
                      {/* Corner nodes */}
                      {currentTracePoints.map((pt, idx) => (
                        <circle
                          key={idx}
                          cx={pt.x}
                          cy={pt.y}
                          r={7 / zoom}
                          fill="#3b82f6"
                          stroke="#ffffff"
                          strokeWidth={2 / zoom}
                        />
                      ))}
                    </g>
                  )}

                  {/* Render Scale Calibration Line */}
                  {scale.isCalibrated && scale.points && (
                    <g>
                      <line
                        x1={scale.points[0].x}
                        y1={scale.points[0].y}
                        x2={scale.points[1].x}
                        y2={scale.points[1].y}
                        stroke="#f59e0b"
                        strokeWidth={4 / zoom}
                        strokeDasharray="4,4"
                      />
                      <circle cx={scale.points[0].x} cy={scale.points[0].y} r={6 / zoom} fill="#f59e0b" />
                      <circle cx={scale.points[1].x} cy={scale.points[1].y} r={6 / zoom} fill="#f59e0b" />
                    </g>
                  )}

                  {/* Render Temporary Calibration Points when marking */}
                  {tempCalibrationPoints.length > 0 && (
                    <g>
                      {tempCalibrationPoints.map((pt, idx) => (
                        <circle
                          key={idx}
                          cx={pt.x}
                          cy={pt.y}
                          r={8 / zoom}
                          fill="#f59e0b"
                          stroke="#ffffff"
                          strokeWidth={2 / zoom}
                        />
                      ))}
                      {tempCalibrationPoints.length === 1 && (
                        <text
                          x={tempCalibrationPoints[0].x}
                          y={tempCalibrationPoints[0].y - 15}
                          fill="#f59e0b"
                          fontSize={12}
                          fontWeight="bold"
                          textAnchor="middle"
                        >
                          Select end point of known length...
                        </text>
                      )}
                    </g>
                  )}
                </svg>
              </div>
            )}
          </div>
        </div>

        {/* Right Dashboard panel (Area Breakdown, AI summary, Room logs) */}
        <div className="w-96 bg-[#111827] border-l border-[#334155] flex flex-col overflow-y-auto shrink-0 shadow-2xl">
          {/* Quick Stats Banner */}
          <div className="p-6 bg-[#1e293b] border-b border-[#334155] space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Calculated Area</span>
              <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/20 font-medium">
                Live Aggregator
              </span>
            </div>

            <div className="space-y-1">
              <div className="text-4xl font-extrabold tracking-tight text-white flex items-baseline gap-2">
                {formatArea(totalAreaValue, currentUnitSuffix)}
              </div>
              <p className="text-xs text-slate-400">
                {useAiForTotal && aiResult
                  ? `Derived from AI floor plan analysis`
                  : `Summed from ${rooms.length} custom-traced zones`}
              </p>
            </div>

            {/* Area Source Toggle if AI result is available */}
            {aiResult && (
              <div className="grid grid-cols-2 gap-2 bg-[#0f172a] p-1.5 rounded-lg border border-[#334155]">
                <button
                  onClick={() => setUseAiForTotal(false)}
                  className={`py-1.5 px-2 text-[11px] font-bold rounded-md transition-all text-center ${
                    !useAiForTotal
                      ? "bg-blue-600 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Custom Tracing ({formatArea(totalTracedArea, currentUnitSuffix)})
                </button>
                <button
                  onClick={() => setUseAiForTotal(true)}
                  className={`py-1.5 px-2 text-[11px] font-bold rounded-md transition-all text-center ${
                    useAiForTotal
                      ? "bg-blue-600 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  AI Estimate ({formatArea(aiResult.totalArea, currentUnitSuffix)})
                </button>
              </div>
            )}
          </div>

          {/* Core App Controls */}
          <div className="p-5 space-y-6 flex-1">
            {/* AI Automated Assistant Panel */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  AI Smart Room Extractor
                </h3>
                <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                  Gemini-3.5
                </span>
              </div>

              {!aiResult && !aiLoading && (
                <div className="bg-[#1e293b] rounded-xl p-4 border border-[#334155] space-y-3">
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Instantly extract and compile list of rooms, custom dimensions, scales, and areas using Gemini&apos;s architectural vision.
                  </p>
                  <button
                    onClick={handleAiAnalyze}
                    className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-blue-500/10 transition-colors"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Run AI Blueprint Analyzer</span>
                  </button>
                </div>
              )}

              {aiLoading && (
                <div className="bg-[#1e293b] rounded-xl p-6 border border-[#334155] text-center space-y-3">
                  <div className="relative w-12 h-12 mx-auto">
                    <div className="absolute inset-0 rounded-full border-2 border-slate-700"></div>
                    <div className="absolute inset-0 rounded-full border-2 border-t-blue-500 animate-spin"></div>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-white">Gemini is analyzing floor plan...</h4>
                    <p className="text-[10px] text-slate-400 mt-1">Reading room annotations & calculating areas</p>
                  </div>
                </div>
              )}

              {aiError && (
                <div className="p-3 bg-red-950/20 border border-red-900/40 rounded-xl text-xs text-red-400">
                  <span className="font-semibold block mb-1">Analysis Error:</span>
                  {aiError}
                  <button
                    onClick={handleAiAnalyze}
                    className="mt-2 block text-[10px] text-blue-400 hover:underline font-semibold"
                  >
                    Try again
                  </button>
                </div>
              )}

              {aiResult && (
                <div className="space-y-3 bg-[#1e293b] p-4 rounded-xl border border-[#334155]">
                  <div className="flex items-center justify-between text-xs border-b border-[#334155] pb-2">
                    <span className="text-slate-300 font-semibold">AI Estimator Results</span>
                    <span className="bg-green-950 text-green-400 px-2 py-0.5 rounded text-[10px] border border-green-500/10">
                      Confidence: {aiResult.confidenceLevel}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] text-slate-300 leading-relaxed italic">
                      &quot;{aiResult.summary}&quot;
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-[10px] bg-[#0f172a] p-2 rounded">
                      <div>
                        <span className="text-slate-500 block">Detected Scale</span>
                        <span className="text-slate-300 font-semibold">{aiResult.detectedScale}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Dominant Units</span>
                        <span className="text-slate-300 font-semibold capitalize">{aiResult.dominantUnit}</span>
                      </div>
                    </div>
                  </div>

                  {/* AI Rooms List */}
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {aiResult.rooms.map((room, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 bg-[#0f172a]/60 rounded text-[11px] border border-[#334155]/50"
                      >
                        <div>
                          <span className="font-medium text-slate-200 block">{room.name}</span>
                          <span className="text-[10px] text-slate-400">Dim: {room.dimensions}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-blue-400 block">
                            {formatArea(room.area, currentUnitSuffix)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Custom Traced Room Logs */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  Traced Room Areas ({rooms.length})
                </span>
                <span className="text-[10px] text-slate-500">Click workspace regions to highlight</span>
              </h3>

              {rooms.length === 0 ? (
                <div className="bg-[#0f172a]/50 p-6 text-center rounded-xl border border-[#334155] text-xs text-slate-500 space-y-2">
                  <Layers className="w-8 h-8 text-slate-600 mx-auto" />
                  <p>No room zones traced yet.</p>
                  <p className="text-[10px] text-slate-400">Use &quot;Trace Room Zone&quot; to calculate custom-drawn floor regions.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {rooms.map((room) => {
                    const isSelected = room.id === selectedRoomId;
                    return (
                      <div
                        key={room.id}
                        onClick={() => setSelectedRoomId(room.id)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? "bg-slate-800 border-blue-500 shadow-md shadow-blue-500/5"
                            : "bg-[#0f172a] border-[#334155] hover:bg-slate-900"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            {/* Room Color indicator */}
                            <div className="flex items-center space-x-2 mb-1">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: room.color }}
                              />
                              <input
                                type="text"
                                value={room.name}
                                onChange={(e) => handleUpdateRoomName(room.id, e.target.value)}
                                className="bg-transparent border-b border-transparent hover:border-[#475569] focus:border-blue-500 focus:outline-none text-xs text-slate-200 font-semibold w-full py-0.5 truncate"
                              />
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-slate-400 pl-4">
                              <span>{room.dimensionsText}</span>
                              {room.notes && <span className="italic truncate max-w-[120px]">&quot;{room.notes}&quot;</span>}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-xs font-bold text-emerald-400 block">
                              {formatArea(room.area, currentUnitSuffix)}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteRoom(room.id);
                              }}
                              className="text-slate-500 hover:text-red-400 p-1 rounded mt-1.5 transition-colors"
                              title="Delete Room"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Actions: Export & Print */}
            {rooms.length > 0 && (
              <div className="pt-2">
                <button
                  onClick={() => {
                    const headers = ["Room Name", "Dimensions", "Area", "Area Unit", "Notes"];
                    const rows = rooms.map((r) => [
                      r.name,
                      r.dimensionsText,
                      r.area.toString(),
                      currentUnitSuffix,
                      r.notes || "",
                    ]);

                    const csvContent =
                      "data:text/csv;charset=utf-8," +
                      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

                    const encodedUri = encodeURI(csvContent);
                    const link = document.createElement("a");
                    link.setAttribute("href", encodedUri);
                    link.setAttribute("download", `Floor_Area_Report_${fileName.split(".")[0]}.csv`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg border border-[#334155] transition-colors"
                >
                  <Download className="w-4 h-4 text-blue-400" />
                  <span>Download Area CSV Report</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scale Calibration distance input modal */}
      {showCalibrationModal && (
        <div className="fixed inset-0 bg-[#000000]/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#1e293b] border border-[#334155] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-amber-400 border-b border-[#334155] pb-3">
              <Ruler className="w-6 h-6" />
              <div>
                <h3 className="text-sm font-bold text-white">Define Calibration Distance</h3>
                <p className="text-[11px] text-slate-400">Step 2: Enter the real physical size of this line segment</p>
              </div>
            </div>

            <form onSubmit={handleCalibrateSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 block">
                  Real world distance ({unitSystem === "metric" ? "meters" : "feet"})
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    autoFocus
                    required
                    value={calibrationInputVal}
                    onChange={(e) => setCalibrationInputVal(e.target.value)}
                    placeholder="e.g. 5"
                    className="w-full bg-[#0f172a] border border-[#334155] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                  <span className="absolute right-4 top-3 text-xs text-slate-400 font-semibold capitalize">
                    {unitSystem === "metric" ? "meters" : "feet"}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed pt-1">
                  We measured a length of <span className="font-semibold text-amber-400">{tempCalibrationPoints.length >= 2 ? Math.round(calculateDistance(tempCalibrationPoints[0], tempCalibrationPoints[1])) : 0} pixels</span> on your plan. This will calibrate the scale multiplier for subsequent area tracing.
                </p>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCalibrationModal(false);
                    setTempCalibrationPoints([]);
                  }}
                  className="px-4 py-2 bg-[#0f172a] hover:bg-slate-800 border border-[#334155] rounded-xl text-xs text-slate-300 font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs text-white font-bold transition-all shadow-lg shadow-blue-500/10"
                >
                  Set Calibration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
