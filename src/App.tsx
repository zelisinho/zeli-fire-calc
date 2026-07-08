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
  formatArea
} from "./utils";
import defaultProjectPlanUrl from "../assets/projekt3.png";
import wallReferenceUrl from "../assets/wall.png";
import doorReferenceUrl from "../assets/entrance.png";
import windowReferenceUrl from "../assets/window.png";

// Sample base64 floor plan so users can try it immediately without a file
import { SAMPLE_FLOOR_PLANS } from "./sample_plans";

const AI_MODEL_OPTIONS = [
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash-Lite" },
  { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
] as const;

const PERSISTED_PLAN_STORAGE_KEY = "fire-calc:last-plan";
const DEFAULT_PROJECT_PLAN_NAME = "projekt3.png";
const CALIBRATION_SNAP_PX = 20;

type PersistedPlanState = {
  imageUrl: string;
  imageMime: string;
  analysisFileData: string;
  analysisMimeType: string;
  imageSize: { width: number; height: number };
  fileName: string;
};

type ReferenceImagePayload = {
  label: string;
  dataUrl: string;
  mimeType: string;
};

function getPersistedPlanState(): PersistedPlanState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(PERSISTED_PLAN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedPlanState;
    if (!parsed?.imageUrl || !parsed?.analysisFileData || !parsed?.fileName) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function renderPdfFirstPage(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Nepodarilo sa pripravit PDF renderer.");
  }

  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height,
  };
}

async function assetUrlToDataUrl(assetUrl: string): Promise<{ dataUrl: string; mimeType: string }> {
  const response = await fetch(assetUrl);
  const blob = await response.blob();

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Nepodarilo sa nacitat predvoleny obrazok projektu."));
    reader.readAsDataURL(blob);
  });

  return {
    dataUrl,
    mimeType: blob.type || "image/png",
  };
}

export default function App() {
  const persistedPlan = getPersistedPlanState();

  // Application state
  const [imageUrl, setImageUrl] = useState<string>(persistedPlan?.imageUrl || defaultProjectPlanUrl);
  const [imageMime, setImageMime] = useState<string>(persistedPlan?.imageMime || "image/png");
  const [analysisFileData, setAnalysisFileData] = useState<string>(persistedPlan?.analysisFileData || "");
  const [analysisMimeType, setAnalysisMimeType] = useState<string>(persistedPlan?.analysisMimeType || "image/png");
  const [imageSize, setImageSize] = useState<{ width: number; height: number }>(persistedPlan?.imageSize || { width: 1200, height: 900 });
  const [fileName, setFileName] = useState<string>(persistedPlan?.fileName || DEFAULT_PROJECT_PLAN_NAME);
  const [fileLoading, setFileLoading] = useState<boolean>(false);
  const [referenceImages, setReferenceImages] = useState<ReferenceImagePayload[]>([]);

  // Calibration and Tracing states
  const [activeTool, setActiveTool] = useState<ToolType>("select");
  const unitSystem: UnitSystem = "metric";
  const [scale, setScale] = useState<ScaleCalibration>({
    pixelLength: 0,
    realLength: 0,
    unit: "millimeters",
    isCalibrated: false,
    points: null,
  });

  // SVG Custom Traced Rooms
  const [rooms, setRooms] = useState<Room[]>([]);

  const [currentTracePoints, setCurrentTracePoints] = useState<Point[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  // Temp points for scale calibration drag/click
  const [tempCalibrationPoints, setTempCalibrationPoints] = useState<Point[]>([]);
  const [calibrationPreviewPoint, setCalibrationPreviewPoint] = useState<Point | null>(null);
  const [calibrationInputVal, setCalibrationInputVal] = useState<string>("5000");
  const [showCalibrationModal, setShowCalibrationModal] = useState<boolean>(false);

  // AI-Assisted Analysis states
  const [aiResult, setAiResult] = useState<AiAnalysisResult | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [useAiForTotal, setUseAiForTotal] = useState<boolean>(false);
  const [selectedAiModel, setSelectedAiModel] = useState<string>("gemini-2.5-flash");
  const [selectedAiRoomIdx, setSelectedAiRoomIdx] = useState<number | null>(null);

  // View state (Pan & Zoom)
  const [zoom, setZoom] = useState<number>(0.8);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const workspaceRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Set default calibrated scale for sample floor plan so it works out of the box
  useEffect(() => {
    if (imageUrl === SAMPLE_FLOOR_PLANS[0].url) {
      setScale({
        pixelLength: 350,
        realLength: 8500,
        unit: "millimeters",
        isCalibrated: true,
        points: [
          { x: 100, y: 150 },
          { x: 450, y: 150 },
        ],
      });
    }
  }, [imageUrl]);

  useEffect(() => {
    if (persistedPlan || analysisFileData || imageUrl !== defaultProjectPlanUrl) return;

    let isCancelled = false;

    assetUrlToDataUrl(defaultProjectPlanUrl)
      .then(({ dataUrl, mimeType }) => {
        if (isCancelled) return;
        setAnalysisFileData(dataUrl);
        setAnalysisMimeType(mimeType);
        setImageMime(mimeType);
        setFileName(DEFAULT_PROJECT_PLAN_NAME);
      })
      .catch((err) => {
        console.error(err);
      });

    return () => {
      isCancelled = true;
    };
  }, [analysisFileData, imageUrl, persistedPlan]);

  useEffect(() => {
    let isCancelled = false;

    Promise.all([
      assetUrlToDataUrl(wallReferenceUrl),
      assetUrlToDataUrl(doorReferenceUrl),
      assetUrlToDataUrl(windowReferenceUrl),
    ])
      .then(([wallReference, doorReference, windowReference]) => {
        if (isCancelled) return;

        setReferenceImages([
          { label: "wall-reference", ...wallReference },
          { label: "door-reference", ...doorReference },
          { label: "window-reference", ...windowReference },
        ]);
      })
      .catch((error) => {
        console.error("Nepodarilo sa nacitat referencne obrazky pre AI.", error);
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !imageUrl || !analysisFileData || !fileName) return;

    const isBundledSample = SAMPLE_FLOOR_PLANS.some((sample) => sample.url === imageUrl);
    if (isBundledSample) return;

    try {
      const payload: PersistedPlanState = {
        imageUrl,
        imageMime,
        analysisFileData,
        analysisMimeType,
        imageSize,
        fileName,
      };
      window.localStorage.setItem(PERSISTED_PLAN_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore persistence errors and keep the current session usable.
    }
  }, [analysisFileData, analysisMimeType, fileName, imageMime, imageSize, imageUrl]);

  // Load selected sample plan
  const handleLoadSample = (sample: typeof SAMPLE_FLOOR_PLANS[0]) => {
    setImageUrl(sample.url);
    setImageMime("image/jpeg");
    setAnalysisFileData(sample.url);
    setAnalysisMimeType("image/jpeg");
    setFileName(sample.name);
    setAiResult(null);
    setSelectedAiRoomIdx(null);
    setAiError(null);
    setRooms([]);
    setZoom(0.8);
    setPan({ x: 0, y: 0 });
    // If it's a sample, set scale calibration automatically so they can draw immediately
    setScale({
      pixelLength: 350,
      realLength: sample.id === "villa" ? 8500 : 12000,
      unit: "millimeters",
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

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    setFileLoading(true);
    setFileName(file.name);
    setAiResult(null);
    setSelectedAiRoomIdx(null);
    setAiError(null);
    setSelectedRoomId(null);
    setRooms([]);
    setCurrentTracePoints([]);
    setScale({ pixelLength: 0, realLength: 0, unit: "millimeters", isCalibrated: false, points: null });
    setCalibrationPreviewPoint(null);

    try {
      if (isPdf) {
        const sourcePdfBase64 = await fileToBase64(file);
        const rendered = await renderPdfFirstPage(file);
        setImageMime("image/png");
        setImageUrl(rendered.dataUrl);
        setImageSize({ width: rendered.width, height: rendered.height });
        setAnalysisFileData(sourcePdfBase64);
        setAnalysisMimeType("application/pdf");
      } else {
        const base64Str = await fileToBase64(file);
        setImageMime(file.type);
        setImageUrl(base64Str);
        setAnalysisFileData(base64Str);
        setAnalysisMimeType(file.type);
      }

      // Trigger automatic scaling notification
      setActiveTool("calibrate");
    } catch (err) {
      console.error(err);
      alert("Subor sa nepodarilo nacitat. Pre PDF sa nacitava prva strana. Skuste PNG, JPG, WEBP alebo standardne PDF.");
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
    if (!analysisFileData) return;
    setAiLoading(true);
    setAiError(null);

    try {
      const response = await fetch("/api/analyze-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileData: analysisFileData,
          mimeType: analysisMimeType,
          model: selectedAiModel,
          referenceImages,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || "Backend analysis failed");
      }

      const result: AiAnalysisResult = await response.json();
      if (!result.success) {
        throw new Error(result.summary || "AI nedokazala spravne spracovat podorys.");
      }

      setAiResult(result);
      setSelectedAiRoomIdx(null);
      setUseAiForTotal(result.rooms.length > 0 && result.totalArea > 0);
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || "Nepodarilo sa spojit so serverom pre analyzu podorysu.");
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

  const snapCalibrationPoint = (point: Point, anchor: Point): Point => {
    const dx = Math.abs(point.x - anchor.x);
    const dy = Math.abs(point.y - anchor.y);
    const snapAxisValue = (value: number) => Math.round(value / CALIBRATION_SNAP_PX) * CALIBRATION_SNAP_PX;

    if (dx >= dy) {
      return { x: snapAxisValue(point.x), y: anchor.y };
    }

    return { x: anchor.x, y: snapAxisValue(point.y) };
  };

  // Handle Workspace interaction click events
  const handleWorkspaceClick = (e: React.MouseEvent<SVGSVGElement>) => {
    // If panning is active, skip click behaviors
    if (activeTool === "select" || isPanning) return;

    const point = getPlanCoords(e);

    if (activeTool === "calibrate") {
      if (tempCalibrationPoints.length === 1) {
        const snappedPoint = calibrationPreviewPoint || snapCalibrationPoint(point, tempCalibrationPoints[0]);
        const newPoints = [...tempCalibrationPoints, snappedPoint];
        setTempCalibrationPoints(newPoints);
        setCalibrationPreviewPoint(null);
        setShowCalibrationModal(true);
        return;
      }

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
      unit: "millimeters",
      isCalibrated: true,
      points: [p1, p2],
    });

    // Reset calibration tools
    setTempCalibrationPoints([]);
    setCalibrationPreviewPoint(null);
    setShowCalibrationModal(false);
    setActiveTool("trace"); // Prompt user to start tracing zones now!
  };

  // Reset scale calibration
  const handleResetCalibration = () => {
    setScale({
      pixelLength: 0,
      realLength: 0,
      unit: "millimeters",
      isCalibrated: false,
      points: null,
    });
    setTempCalibrationPoints([]);
    setCalibrationPreviewPoint(null);
  };

  // Finish room boundary tracing and save polygon area
  const handleFinishTracing = () => {
    if (currentTracePoints.length < 3) {
      alert("Miestnost musi mat aspon 3 body, aby vznikol polygon plochy.");
      return;
    }

    if (!scale.isCalibrated) {
      alert("Najprv kalibrujte mierku vykresu, aby bolo mozne vypocitat realnu plochu.");
      return;
    }

    // Calculate pixel area
    const pixelArea = calculatePolygonPixelArea(currentTracePoints);

    // Convert pixel area to physical area in m2 using millimeter calibration
    const scaleFactorMmPerPx = scale.realLength / scale.pixelLength;
    const physicalAreaMm2 = pixelArea * Math.pow(scaleFactorMmPerPx, 2);
    const physicalArea = parseFloat((physicalAreaMm2 / 1_000_000).toFixed(2));

    const newRoom: Room = {
      id: generateId(),
      name: `Miestnost ${rooms.length + 1}`,
      points: currentTracePoints,
      area: physicalArea,
      color: generatePastelColor(),
      isAiDetected: false,
      dimensionsText: `${currentTracePoints.length} bodov`,
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

  // Update AI-detected room attributes inline (e.g., dimensions/calculation)
  const handleUpdateAiRoom = (idx: number, patch: Partial<AiAnalysisResult["rooms"][number]>) => {
    setAiResult((prev) => {
      if (!prev) return prev;
      const nextRooms = prev.rooms.map((room, roomIdx) =>
        roomIdx === idx ? { ...room, ...patch } : room
      );

      const nextTotalArea = parseFloat(
        nextRooms.reduce((sum, room) => sum + (Number.isFinite(room.area) ? room.area : 0), 0).toFixed(2)
      );

      return { ...prev, rooms: nextRooms, totalArea: nextTotalArea };
    });
  };

  const tryParseAreaFromCalculation = (calculation: string): number | null => {
    const raw = calculation.trim();
    if (!raw) return null;

    const normalizedForNumber = (val: string) => val.replace(/\s/g, "").replace(/,/g, ".");

    // If user types explicit result after '=' prefer that value.
    if (raw.includes("=")) {
      const rhs = raw.split("=").pop()?.trim() || "";
      const rhsNumber = Number(normalizedForNumber(rhs));
      if (Number.isFinite(rhsNumber)) {
        return parseFloat(rhsNumber.toFixed(2));
      }
    }

    // Otherwise evaluate the left side arithmetic expression.
    let expr = raw.split("=")[0].trim();
    expr = expr.replace(/[xX×]/g, "*");
    expr = expr.replace(/,/g, "");

    if (!/^[0-9+\-*/().\s]+$/.test(expr)) return null;

    try {
      const value = Function(`"use strict"; return (${expr});`)();
      if (typeof value === "number" && Number.isFinite(value)) {
        return parseFloat(value.toFixed(2));
      }
      return null;
    } catch {
      return null;
    }
  };

  // Calculate sum of custom-traced areas
  const totalTracedArea = rooms.reduce((sum, r) => sum + r.area, 0);

  // Computed total showing on high level
  const areaCalculationReady = scale.isCalibrated;
  const totalAreaValue = useAiForTotal && aiResult ? aiResult.totalArea : totalTracedArea;
  const currentUnitSuffix = "sqm";
  const calibrationQuoteRows =
    aiResult?.calibrationQuotes?.map((quote) => ({
      ...quote,
      mmPerPx: quote.pixelLength > 0 ? quote.quotedLengthMm / quote.pixelLength : null,
    })) ?? [];
  const calibrationAverageMmPerPx = (() => {
    const values = calibrationQuoteRows.map((quote) => quote.mmPerPx).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (values.length === 0) return null;

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  })();
  const toolLabelMap: Record<ToolType, string> = {
    select: "vyber",
    calibrate: "kalibracia",
    trace: "obkreslenie",
  };

  const getAiRoomColor = (idx: number): string => {
    const hue = (idx * 67) % 360;
    return `hsl(${hue} 88% 60%)`;
  };

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

  const handleCalibrationMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool !== "calibrate" || tempCalibrationPoints.length !== 1 || isPanning) {
      if (calibrationPreviewPoint) setCalibrationPreviewPoint(null);
      return;
    }

    const point = getPlanCoords(e);
    setCalibrationPreviewPoint(snapCalibrationPoint(point, tempCalibrationPoints[0]));
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Format dynamic display summary of scale calibration
  const scaleDisplayString = () => {
    if (!scale.isCalibrated) return "Nekalibrovane";
    const unitLabel = scale.unit === "millimeters" ? "mm" : "ft";
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
              Kalkulacka plochy podorysu
              <span className="text-xs bg-[#334155] text-blue-400 px-2 py-0.5 rounded-full font-normal border border-blue-500/10">
                Desktop verzia
              </span>
            </h1>
            <p className="text-xs text-slate-400">Vypocet hranic miestnosti a celkovej podlahovej plochy s pixelovou presnostou a AI</p>
          </div>
        </div>

        {/* Global Toolbar Controls */}
        <div className="flex items-center space-x-4">
          {/* Sample loader */}
          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-400 font-medium">Nacitat vzorovy podorys:</span>
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
              1. Import podorysu
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
                <span className="text-xs font-semibold text-slate-300">Vyberte vykres podorysu</span>
                <span className="text-[10px] text-slate-500 block">PNG, JPG, WEBP alebo PDF</span>
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
              2. Nastroje mierky
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
                  {scale.isCalibrated ? "Podorys je kalibrovany" : "Je potrebna kalibracia"}
                </span>
                {scale.isCalibrated && (
                  <button 
                    onClick={handleResetCalibration}
                    className="text-slate-400 hover:text-white hover:bg-[#334155] p-1 rounded transition-colors"
                    title="Kalibrovat znova"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <p className="text-[11px] opacity-80 leading-relaxed">
                {scale.isCalibrated 
                  ? `Definovana vzdialenost: ${scaleDisplayString()}`
                  : "Kalibrujte mierku, aby sa pixely vo vykrese presne previedli na realnu plochu."}
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
                    <div className="text-xs font-semibold">Kalibrovat mierku</div>
                    <div className="text-[10px] text-slate-400">Kliknite na 2 body znamej vzdialenosti</div>
                  </div>
                </div>
                {scale.isCalibrated && <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />}
              </button>

              <button
                onClick={() => {
                  if (!scale.isCalibrated) {
                    alert("Najprv kalibrujte mierku podorysu pomocou tlacidla 'Kalibrovat mierku'.");
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
                    <div className="text-xs font-semibold">Obkreslit zonu miestnosti</div>
                    <div className="text-[10px] text-slate-400">Klikajte na rohy miestnosti pre vytvorenie polygonu</div>
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
                    <div className="text-xs font-semibold">Vyber / Posun zobrazenia</div>
                    <div className="text-[10px] text-slate-400">Skontrolujte obrysy alebo presunte podorys</div>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Section 3: Interactive Instruction manual */}
          <div className="bg-[#0f172a] rounded-xl p-3.5 border border-[#334155] space-y-2 text-xs">
            <h4 className="font-semibold text-slate-300 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-blue-400" />
              Rychly navod pracovnej plochy:
            </h4>
            <ul className="space-y-1.5 text-slate-400 text-[11px] list-disc list-inside">
              {activeTool === "calibrate" && (
                <>
                  <li className="text-blue-300 font-medium">Kliknite raz pre zaciatocny bod</li>
                  <li className="text-blue-300 font-medium">Kliknite znova pre koncovy bod</li>
                  <li>Zadajte skutocnu dlzku tejto ciary pre kalibraciu</li>
                </>
              )}
              {activeTool === "trace" && (
                <>
                  <li className="text-emerald-300 font-medium">Kliknite na kazdy roh miestnosti</li>
                  <li>Kliknite nizsie na &quot;Dokoncit zonu&quot; pre uzavretie miestnosti</li>
                  <li>Mozete obkreslit viac miestnosti a spocitat ich spolu</li>
                </>
              )}
              {activeTool === "select" && (
                <>
                  <li>Kliknite na obkreslenu miestnost pre premenovanie/odstranenie</li>
                  <li>Podrzte a posuvajte obraz pre kontrolu konkretnych zon</li>
                  <li>Pouzite ovladanie priblizenia alebo koliesko mysi</li>
                </>
              )}
            </ul>
          </div>

          {/* Active Tracing Controls */}
          {activeTool === "trace" && currentTracePoints.length > 0 && (
            <div className="bg-emerald-950/30 border border-emerald-500/25 p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-400">Obkreslovanie plochy miestnosti...</span>
                <span className="text-xs bg-emerald-900/50 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/20">
                  {currentTracePoints.length} bodov
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleFinishTracing}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-3 rounded-lg text-xs shadow-lg transition-colors"
                >
                  Dokoncit zonu
                </button>
                <button
                  onClick={() => setCurrentTracePoints([])}
                  className="bg-[#0f172a] hover:bg-slate-800 text-slate-300 py-2 px-3 rounded-lg text-xs border border-[#334155] transition-colors"
                >
                  Vymazat body
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
              title="Priblizit"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(z - 0.15, 0.2))}
              className="p-1.5 rounded text-slate-300 hover:bg-[#334155] hover:text-white transition-colors"
              title="Oddialit"
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
              Reset zobrazenia
            </button>
            <div className="h-4 w-[1px] bg-[#334155]" />
            <span className="text-[10px] text-slate-300 font-mono pr-2">Priblizenie: {Math.round(zoom * 100)}%</span>
          </div>

          <div className="absolute top-4 right-4 z-20 flex items-center space-x-2">
            <span className="text-xs bg-slate-900/90 backdrop-blur border border-[#334155] px-3 py-1.5 rounded-lg text-slate-300 font-medium">
              Rezim: <span className="text-blue-400 capitalize">{toolLabelMap[activeTool]}</span>
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
                <p className="text-sm text-slate-400">Nacitavam vykres podorysu...</p>
              </div>
            ) : !imageUrl ? (
              <div className="text-center p-8 space-y-4 max-w-md">
                <div className="mx-auto w-16 h-16 rounded-2xl border border-dashed border-slate-600 flex items-center justify-center bg-slate-900/40">
                  <Upload className="w-8 h-8 text-slate-400" />
                </div>
                <div className="space-y-1">
                  <p className="text-base font-semibold text-slate-200">Nahrajte svoj projektovy vykres</p>
                  <p className="text-sm text-slate-400">Modern Villa uz nie je predvoleny. Po prvom nahrati sa tento vykres stane vasim predvolenym obrazkom.</p>
                </div>
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
                  alt="Podorys domu"
                  onLoad={handleImageLoad}
                  className="max-w-none shadow-2xl border-4 border-slate-700 pointer-events-none rounded-sm select-none"
                  style={{ width: `${imageSize.width}px`, height: `${imageSize.height}px` }}
                />

                {/* SVG Tracing Vector Layer Overlay */}
                <svg
                  className="absolute inset-0 w-full h-full"
                  viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
                  onClick={handleWorkspaceClick}
                  onMouseMove={handleCalibrationMouseMove}
                  onMouseLeave={() => setCalibrationPreviewPoint(null)}
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

                  {/* Render all AI room zones with visible boundaries */}
                  {aiResult?.rooms.map((room, idx) => {
                    if (!room.bbox) return null;

                    const roomColor = getAiRoomColor(idx);

                    const nx = Math.max(0, Math.min(1, room.bbox.x));
                    const ny = Math.max(0, Math.min(1, room.bbox.y));
                    const nw = Math.max(0.02, Math.min(1 - nx, room.bbox.width));
                    const nh = Math.max(0.02, Math.min(1 - ny, room.bbox.height));

                    const x = nx * imageSize.width;
                    const y = ny * imageSize.height;
                    const w = nw * imageSize.width;
                    const h = nh * imageSize.height;

                    return (
                      <g key={`ai-overlay-${idx}`} className="pointer-events-none">
                        <rect
                          x={x}
                          y={y}
                          width={w}
                          height={h}
                          rx={8 / zoom}
                          fill={roomColor}
                          fillOpacity={selectedAiRoomIdx === idx ? 0.28 : 0.16}
                          stroke={selectedAiRoomIdx === idx ? roomColor : `${roomColor}`}
                          strokeWidth={selectedAiRoomIdx === idx ? 5 / zoom : 3 / zoom}
                          strokeDasharray={selectedAiRoomIdx === idx ? `${8 / zoom},${6 / zoom}` : `${5 / zoom},${4 / zoom}`}
                        />

                        <g transform={`translate(${x + w / 2}, ${Math.max(y - 16 / zoom, 18 / zoom)})`}>
                          <rect
                            x={-96 / zoom}
                            y={-12 / zoom}
                            width={192 / zoom}
                            height={22 / zoom}
                            rx={6 / zoom}
                            fill="rgba(15, 23, 42, 0.95)"
                            stroke={roomColor}
                            strokeWidth={1.5 / zoom}
                          />
                          <text
                            textAnchor="middle"
                            y={3 / zoom}
                            fill={roomColor}
                            fontSize={10 / zoom}
                            fontWeight="bold"
                          >
                            {`${room.roomCode || room.name}: ${formatArea(room.area, currentUnitSuffix)}`.slice(0, 48)}
                          </text>
                        </g>
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
                      {tempCalibrationPoints.length === 1 && calibrationPreviewPoint && (
                        <g>
                          <line
                            x1={tempCalibrationPoints[0].x}
                            y1={tempCalibrationPoints[0].y}
                            x2={calibrationPreviewPoint.x}
                            y2={calibrationPreviewPoint.y}
                            stroke="#f59e0b"
                            strokeWidth={3 / zoom}
                            strokeDasharray={`${6 / zoom},${6 / zoom}`}
                          />
                          <circle
                            cx={calibrationPreviewPoint.x}
                            cy={calibrationPreviewPoint.y}
                            r={8 / zoom}
                            fill="#f59e0b"
                            fillOpacity={0.18}
                            stroke="#fbbf24"
                            strokeWidth={2 / zoom}
                          />
                        </g>
                      )}
                      {tempCalibrationPoints.length === 1 && (
                        <text
                          x={tempCalibrationPoints[0].x}
                          y={tempCalibrationPoints[0].y - 15}
                          fill="#f59e0b"
                          fontSize={12}
                          fontWeight="bold"
                          textAnchor="middle"
                        >
                          Vyberte koncovy bod znamej vzdialenosti...
                        </text>
                      )}
                    </g>
                  )}
                </svg>
              </div>
            )}
          </div>
        </div>

        {/* Right Dashboard panel (Calibration, AI summary, Room logs) */}
        <div className="w-96 bg-[#111827] border-l border-[#334155] flex flex-col overflow-y-auto shrink-0 shadow-2xl">
          {/* Calibration Status Banner */}
          <div className="p-6 bg-[#1e293b] border-b border-[#334155] space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Kalibracia podorysu</span>
              <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/20 font-medium">
                10 kvot
              </span>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-slate-400">
                {aiResult
                  ? `Kalibracia podorysu: 10 kvót z podorysu v tabuľke.`
                  : `Spustite AI analyzu a ziskate tabulku 10 vybranych kvót.`}
              </p>
            </div>

            {/* Area Source Toggle if AI result is available */}
            {areaCalculationReady && aiResult && aiResult.rooms.length > 0 && (
              <div className="grid grid-cols-2 gap-2 bg-[#0f172a] p-1.5 rounded-lg border border-[#334155]">
                <button
                  onClick={() => setUseAiForTotal(false)}
                  className={`py-1.5 px-2 text-[11px] font-bold rounded-md transition-all text-center ${
                    !useAiForTotal
                      ? "bg-blue-600 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Vlastne obkreslenie ({formatArea(totalTracedArea, currentUnitSuffix)})
                </button>
                <button
                  onClick={() => setUseAiForTotal(true)}
                  className={`py-1.5 px-2 text-[11px] font-bold rounded-md transition-all text-center ${
                    useAiForTotal
                      ? "bg-blue-600 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  AI odhad ({formatArea(aiResult.totalArea, currentUnitSuffix)})
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
                  AI extraktor miestnosti
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500">Model</span>
                  <select
                    value={selectedAiModel}
                    onChange={(e) => setSelectedAiModel(e.target.value)}
                    className="text-[10px] bg-slate-800 text-slate-300 px-2 py-1 rounded border border-[#334155] focus:outline-none focus:border-blue-500"
                  >
                    {AI_MODEL_OPTIONS.map((modelOption) => (
                      <option key={modelOption.id} value={modelOption.id}>
                        {modelOption.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {!aiResult && !aiLoading && (
                <div className="bg-[#1e293b] rounded-xl p-4 border border-[#334155] space-y-3">
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Okamzite ziskajte zoznam miestnosti, rozmerov, mierky a ploch pomocou architektonickej vizie Gemini.
                  </p>
                  <button
                    onClick={handleAiAnalyze}
                    disabled={!analysisFileData}
                    className={`w-full flex items-center justify-center space-x-2 py-2.5 px-4 text-white text-xs font-bold rounded-lg shadow-lg shadow-blue-500/10 transition-colors ${
                      analysisFileData ? "bg-blue-600 hover:bg-blue-500" : "bg-slate-700 cursor-not-allowed opacity-60"
                    }`}
                    title={!analysisFileData ? "Najprv nahravajte podorys" : undefined}
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Spustit AI analyzu podorysu</span>
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
                    <h4 className="text-xs font-semibold text-white">Gemini analyzuje podorys...</h4>
                    <p className="text-[10px] text-slate-400 mt-1">Model: {selectedAiModel} | Citanie anotacii miestnosti a vypocet ploch</p>
                  </div>
                </div>
              )}

              {aiError && (
                <div className="p-3 bg-red-950/20 border border-red-900/40 rounded-xl text-xs text-red-400">
                  <span className="font-semibold block mb-1">Chyba analyzy:</span>
                  {aiError}
                  <button
                    onClick={handleAiAnalyze}
                    className="mt-2 block text-[10px] text-blue-400 hover:underline font-semibold"
                  >
                    Skusit znova
                  </button>
                </div>
              )}

              {aiResult && calibrationQuoteRows.length > 0 && (
                <div className="space-y-2 bg-[#1e293b] p-4 rounded-xl border border-[#334155]">
                  <div className="flex items-center justify-between text-xs border-b border-[#334155] pb-2">
                    <span className="text-slate-300 font-semibold">Kalibracia podorysu</span>
                  </div>

                  <div className="grid grid-cols-1 gap-2 text-[10px] bg-[#0f172a] p-2 rounded">
                    <div>
                      <span className="text-slate-500 block">Aritmeticky priemer mm/px</span>
                      <span className="text-slate-300 font-semibold">
                        {calibrationAverageMmPerPx !== null ? calibrationAverageMmPerPx.toFixed(4) : "Nedostupne"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {aiResult && (
                <div className="space-y-3 bg-[#1e293b] p-4 rounded-xl border border-[#334155]">
                  <div className="flex items-center justify-between text-xs border-b border-[#334155] pb-2">
                    <span className="text-slate-300 font-semibold">Vysledky AI odhadu</span>
                    <span className="bg-green-950 text-green-400 px-2 py-0.5 rounded text-[10px] border border-green-500/10">
                      Dovera: {aiResult.confidenceLevel}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px] bg-[#0f172a] p-2 rounded">
                    <div>
                      <span className="text-slate-500 block">Celkova plocha</span>
                      <span className="text-slate-300 font-semibold">{formatArea(aiResult.totalArea, currentUnitSuffix)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Pocet miestnosti</span>
                      <span className="text-slate-300 font-semibold">{aiResult.rooms.length}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Kalibracia mm/px</span>
                      <span className="text-slate-300 font-semibold">
                        {aiResult.calibrationMmPerPixel ? aiResult.calibrationMmPerPixel.toFixed(4) : "Nedostupne"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Zhoda kalibracie</span>
                      <span className="text-slate-300 font-semibold">{aiResult.calibrationConsistency ?? 0}%</span>
                    </div>
                  </div>

                  <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {aiResult.rooms.length > 0 ? (
                      aiResult.rooms.map((room, idx) => {
                        const fallbackCodeMatch = room.name.match(/\b\d+\.\d+\b/);
                        const roomCode = room.roomCode || fallbackCodeMatch?.[0] || null;
                        const isSelectedAiRoom = selectedAiRoomIdx === idx;

                        return (
                          <div
                            key={idx}
                            onClick={() => setSelectedAiRoomIdx(idx)}
                            className={`flex items-center justify-between p-2 rounded text-[11px] border cursor-pointer transition-all ${
                              isSelectedAiRoom
                                ? "bg-blue-900/25 border-blue-400/50"
                                : "bg-[#0f172a]/60 border-[#334155]/50 hover:border-blue-500/40"
                            }`}
                          >
                            <div>
                              <div className="flex items-center gap-1.5">
                                {roomCode && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/25 font-semibold">
                                    {roomCode}
                                  </span>
                                )}
                                <span className="font-medium text-slate-200 block">{room.name}</span>
                              </div>
                              <span className="text-[10px] text-slate-400 block mt-1">Rozmer: {room.dimensions}</span>
                              <span className="text-[10px] text-slate-500 block mt-1">{room.calculation || ""}</span>
                              {room.sourceMethod && (
                                <span className="text-[10px] text-slate-500 block">
                                  Zdroj: {room.sourceMethod === "estimated" ? "odhad" : "meranie"}
                                </span>
                              )}
                            </div>
                            <div className="text-right">
                              <span className="font-bold text-blue-400 block">{formatArea(room.area, currentUnitSuffix)}</span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-[10px] text-amber-200">
                        AI zatiaľ nevrátila rozpis miestností. Skúste analýzu znova alebo iný model.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Custom Traced Room Logs */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  Obkreslene plochy miestnosti ({rooms.length})
                </span>
                <span className="text-[10px] text-slate-500">Kliknite na oblasti pre zvyraznenie</span>
              </h3>

              {rooms.length === 0 ? (
                <div className="bg-[#0f172a]/50 p-6 text-center rounded-xl border border-[#334155] text-xs text-slate-500 space-y-2">
                  <Layers className="w-8 h-8 text-slate-600 mx-auto" />
                  <p>Zatial nie su obkreslene ziadne zony miestnosti.</p>
                  <p className="text-[10px] text-slate-400">Pouzite &quot;Obkreslit zonu miestnosti&quot; pre vypocet vlastnych oblasti podlahy.</p>
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
                              title="Odstranit miestnost"
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
                    const headers = ["Nazov miestnosti", "Rozmery", "Plocha", "Jednotka plochy", "Poznamky"];
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
                    link.setAttribute("download", `Report_Plochy_${fileName.split(".")[0]}.csv`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg border border-[#334155] transition-colors"
                >
                  <Download className="w-4 h-4 text-blue-400" />
                  <span>Stiahnut CSV report plochy</span>
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
                <h3 className="text-sm font-bold text-white">Definovat kalibracnu vzdialenost</h3>
                <p className="text-[11px] text-slate-400">Krok 2: Zadajte skutocnu dlzku tohto useku</p>
              </div>
            </div>

            <form onSubmit={handleCalibrateSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 block">
                  Vzdialenost v reale (mm)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    autoFocus
                    required
                    value={calibrationInputVal}
                    onChange={(e) => setCalibrationInputVal(e.target.value)}
                    placeholder="napr. 5000"
                    className="w-full bg-[#0f172a] border border-[#334155] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                  <span className="absolute right-4 top-3 text-xs text-slate-400 font-semibold capitalize">
                    mm
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed pt-1">
                  Na podoryse sme namerali dlzku <span className="font-semibold text-amber-400">{tempCalibrationPoints.length >= 2 ? Math.round(calculateDistance(tempCalibrationPoints[0], tempCalibrationPoints[1])) : 0} pixelov</span>. Tato hodnota nastavi koeficient mierky pre dalsie obkreslovanie plochy.
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
                  Zrusit
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs text-white font-bold transition-all shadow-lg shadow-blue-500/10"
                >
                  Nastavit kalibraciu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
