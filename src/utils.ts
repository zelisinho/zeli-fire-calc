import { Point } from "./types";

/**
 * Calculates the area of a non-self-intersecting polygon using the Shoelace formula (Gauss's Area Formula).
 * Returns the area in square pixels.
 */
export function calculatePolygonPixelArea(points: Point[]): number {
  const n = points.length;
  if (n < 3) return 0;

  let area = 0;
  for (let i = 0; i < n; i++) {
    const current = points[i];
    const next = points[(i + 1) % n];
    area += current.x * next.y - next.x * current.y;
  }

  return Math.abs(area) / 2;
}

/**
 * Computes the Euclidean distance between two points in pixels.
 */
export function calculateDistance(p1: Point, p2: Point): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

/**
 * Generates a unique ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

/**
 * Generates a pleasing architectural pastel color with transparency
 */
export function generatePastelColor(): string {
  // Pastel colors have high light values (HSP / HSL)
  const hue = Math.floor(Math.random() * 360);
  // Keep saturation moderate (50-70%) and lightness high (65-80%)
  return `hsla(${hue}, 65%, 72%, 0.4)`;
}

/**
 * Converts file to base64 string
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
}

/**
 * Converts square meters to square feet
 */
export function sqmToSqft(sqm: number): number {
  return sqm * 10.7639;
}

/**
 * Converts square feet to square meters
 */
export function sqftToSqm(sqft: number): number {
  return sqft / 10.7639;
}

/**
 * Formats a raw area value with thousands separators and unit suffix
 */
export function formatArea(area: number, unit: "sqm" | "sqft"): string {
  const formatted = area.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${formatted} ${unit === "sqm" ? "m²" : "sq ft"}`;
}
