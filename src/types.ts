export interface Point {
  x: number;
  y: number;
}

export interface Room {
  id: string;
  name: string;
  points: Point[]; // Coordinates relative to the natural image dimensions
  area: number;    // Calculated area in sqm or sqft
  color: string;   // Hex color for tracing display
  isAiDetected: boolean;
  dimensionsText: string;
  notes?: string;
}

export interface ScaleCalibration {
  pixelLength: number;     // Distance in pixels on the natural image
  realLength: number;      // Real-world length entered by the user
  unit: "millimeters" | "feet"; // The physical units (mm or ft)
  isCalibrated: boolean;
  points: [Point, Point] | null; // The two calibration end-points
}

export interface AiRoom {
  roomCode?: string;
  name: string;
  dimensions: string;
  area: number;
  confidence: string;
  calculation?: string;
  sourceMethod?: string;
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  notes?: string;
}

export interface CalibrationQuoteSample {
  label: string;
  quotedLengthMm: number;
  pixelLength: number;
  wallAdjusted?: boolean;
  notes?: string;
}

export interface AiAnalysisResult {
  success: boolean;
  detectedScale: string;
  dominantUnit: string; // "meters" or "feet"
  areaUnit: string;     // "sqm" or "sqft"
  calibrationMmPerPixel?: number;
  calibrationConsistency?: number;
  calibrationQuotesUsed?: number;
  calibrationAttempts?: number;
  calibrationQuotes?: CalibrationQuoteSample[];
  totalArea: number;
  confidenceLevel: string;
  summary: string;
  rooms: AiRoom[];
}

export type ToolType = "select" | "calibrate" | "trace";
export type UnitSystem = "metric" | "imperial";
