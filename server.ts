import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const SUPPORTED_MODELS = [
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
] as const;

type CalibrationQuoteSample = {
  label: string;
  quotedLengthMm: number;
  pixelLength: number;
  wallAdjusted?: boolean;
  notes?: string;
};

function computeMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function computeCalibrationMetrics(samples: CalibrationQuoteSample[]) {
  const validSamples = samples.filter(
    (sample) => Number.isFinite(sample.quotedLengthMm) && sample.quotedLengthMm > 0 && Number.isFinite(sample.pixelLength) && sample.pixelLength > 0
  );

  const ratios = validSamples.map((sample) => sample.quotedLengthMm / sample.pixelLength);
  const averageRatio = ratios.length > 0 ? ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length : null;

  if (!averageRatio) {
    return {
      medianRatio: null,
      consistency: 0,
      sampleCount: validSamples.length,
    };
  }

  const consistentCount = ratios.filter((ratio) => Math.abs(ratio - averageRatio) / averageRatio <= 0.1).length;

  return {
    medianRatio: averageRatio,
    consistency: consistentCount / validSamples.length,
    sampleCount: validSamples.length,
  };
}

function buildCalibrationPrompt(attempt: number): string {
  const retryNote =
    attempt === 1
      ? ""
      : `\nRetry attempt ${attempt}: the previous calibration response was weak. Return a different set of 10 stronger dimension quotes.`;

  return `You are a professional architectural estimator and floor plan analyzer.
  Analyze the attached house plan (image or PDF first page) and find calibration quotes only.${retryNote}

Priority workflow (must follow):
1. Pick exactly 10 strong quotes from different parts of the drawing and return them in calibrationQuotes.
2. For each of those 10 quotes, estimate the corresponding pixel span in the drawing and return it in calibrationQuotes.
3. Use walls, entrances, and windows as visual references for choosing dimension quotes and boundary-aware spans.
4. Prefer long, clear architectural dimension lines. Avoid furniture labels, fixture sizes, and ambiguous text when better quotes exist.
5. Return rooms as an empty array in this step.

Calibration rules:
6. Use the wall, entrance, and window reference images to make the quote selection more precise.
7. Use those 10 quotes to derive mm-per-pixel calibration. The goal is that at least 90% of the quote-derived mm/px ratios are mutually consistent.
8. Return only the calibration outputs, summary, and any notes about the quotes used.

Output rules:
- Keep numbers realistic and internally consistent.
- In summary and/or notes mention that multiple quotes were used for calibration when possible.
- Set success=true when the 10 calibration quotes were parsed.`;
}

function buildRoomAnalysisPrompt(calibrationMmPerPixel: number, calibrationConsistency: number, calibrationQuotes: CalibrationQuoteSample[], attempt: number): string {
  const retryNote =
    attempt === 1
      ? ""
      : `\nRetry attempt ${attempt}: the previous room extraction was empty or incomplete. Return a non-empty rooms array with all identifiable rooms.`;

  const calibrationQuotesText = calibrationQuotes
    .map((quote) => `${quote.label}: ${quote.quotedLengthMm}mm / ${quote.pixelLength}px`)
    .join("; ");

  return `You are a professional architectural estimator and floor plan analyzer.
Analyze the attached house plan (image or PDF first page) and calculate individual rooms using the calibration below.${retryNote}

Calibration to use for this pass:
- arithmetic mean mm-per-pixel: ${calibrationMmPerPixel.toFixed(4)}
- calibration consistency: ${calibrationConsistency}%
- calibration quotes: ${calibrationQuotesText}

Priority workflow (must follow):
1. Detect individual rooms and return them in the rooms array with roomCode, name, dimensions, area, calculation, sourceMethod, and bbox when possible. Do not return rooms: [] when the plan clearly contains identifiable rooms.
2. Determine room boundaries using the reference images for walls, entrances, and windows.
3. Calculate room dimensions and area using the arithmetic-mean calibration value above.
4. Include the concrete formula used per room and show wall deductions when applicable.
5. Return the rooms array as the primary output.

Room boundary extraction rules:
6. When analyzing rooms, mark only the room boundaries formed by walls, door openings, and windows.
7. Treat wall thickness quotes exactly as they appear on the drawing and use them to determine the true room boundary.
8. A room is also bounded by an entrance or doorway.
9. A window is also a boundary detail.
10. Do not draw or describe anything outside the room boundary. Ignore furniture, fixtures, labels, and decorative symbols when tracing the boundary.

Area calculation rules:
11. If dimensions are in mm, compute exact area in m2 using net internal dimensions only:
    area_m2 = (net_length_mm * net_width_mm) / 1_000_000
12. If a room is not a perfect rectangle, infer its polygon or composite rectangular parts from wall-bounded geometry using the calibrated mm-per-pixel ratio and subtract/add parts as needed.
13. If a direct internal room quote exists, prefer it over a larger structural quote.
14. Use estimation only when no readable dimensions and no reliable calibrated geometric reconstruction exist, and mark sourceMethod as "estimated".
15. Return the calibration quotes unchanged in calibrationQuotes if present in the schema.

Output rules:
- Keep numbers realistic and internally consistent.
- Prefer net usable room dimensions after deducting all crossed walls.
- Set success=true when rooms were identified.`;
}

async function startServer() {
  console.log(`[Server] Starting Floor Plan Area Calculator server...`);
      
  const app = express();
  const PORT = 3000;

  // Configure high body limit for handling uploaded blueprint images and PDFs
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Initialize Gemini client gracefully
  let aiClient: GoogleGenAI | null = null;
  function getGeminiClient() {
    if (!aiClient) {
      const apiKey =
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        process.env.GEMINI_KEY;
      if (!apiKey) {
        throw new Error(
          "Missing Gemini API key. Add GEMINI_API_KEY (or GOOGLE_API_KEY) to your .env file and restart the server."
        );
      }
      aiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    }
    return aiClient;
  }

  // API Route to analyze floor plan image or PDF and compute areas
  app.post("/api/analyze-plan", async (req: express.Request, res: express.Response) => {
    try {
      const { fileData, mimeType, model, referenceImages } = req.body;
      if (!fileData || !mimeType) {
        return res.status(400).json({ error: "Missing fileData or mimeType of the floor plan file." });
      }

      const selectedModel = typeof model === "string" && model.trim().length > 0 ? model.trim() : "gemini-3.5-flash";
      if (!SUPPORTED_MODELS.includes(selectedModel as typeof SUPPORTED_MODELS[number])) {
        return res.status(400).json({
          error: `Unsupported model '${selectedModel}'. Supported: ${SUPPORTED_MODELS.join(", ")}`,
        });
      }

      // Strip off base64 prefix if present
      const base64Data = fileData.replace(/^data:.*?;base64,/, "");
      const referenceImageList = Array.isArray(referenceImages)
        ? referenceImages
            .map((referenceImage: any) => ({
              dataUrl: typeof referenceImage?.dataUrl === "string" ? referenceImage.dataUrl : "",
              mimeType: typeof referenceImage?.mimeType === "string" ? referenceImage.mimeType : "",
            }))
            .filter((referenceImage: { dataUrl: string; mimeType: string }) => referenceImage.dataUrl.length > 0 && referenceImage.mimeType.length > 0)
        : [];

      const ai = getGeminiClient();

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          success: { type: Type.BOOLEAN },
          detectedScale: { type: Type.STRING, description: "Any scale detected on the plan (e.g. 1:100, 1/4 inch, or 'Not found')." },
          dominantUnit: { type: Type.STRING, description: "The dominant measurement unit found: 'meters' or 'feet'." },
          areaUnit: { type: Type.STRING, description: "The unit of calculated area: 'sqm' or 'sqft'." },
          totalArea: { type: Type.NUMBER, description: "For calibration-only mode, return 0." },
          confidenceLevel: { type: Type.STRING, description: "Overall confidence: 'high', 'medium', or 'low'." },
          summary: { type: Type.STRING, description: "High-level summary of the calibration analysis and how the 10 quotes were selected." },
          calibrationQuotes: {
            type: Type.ARRAY,
            description: "Exactly 10 quote samples used to estimate mm-per-pixel calibration.",
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING, description: "Short identifier for the quote, e.g. room code or quote text." },
                quotedLengthMm: { type: Type.NUMBER, description: "Quoted real-world length in millimeters after any wall deduction if needed." },
                pixelLength: { type: Type.NUMBER, description: "Estimated pixel span for the same quote in the drawing." },
                wallAdjusted: { type: Type.BOOLEAN, description: "True if wall thickness was deducted from a gross quote." },
                notes: { type: Type.STRING, description: "Optional note about this quote sample." }
              },
              required: ["label", "quotedLengthMm", "pixelLength"]
            }
          },
          rooms: {
            type: Type.ARRAY,
            description: "Populate this array with every identifiable room, including room boundaries, dimensions, and area calculated using the arithmetic-mean calibration.",
            items: {
              type: Type.OBJECT,
              properties: {
                roomCode: { type: Type.STRING, description: "Room identifier from drawing/legend (e.g. 1.01, 1.02)." },
                name: { type: Type.STRING, description: "Room/zone name (e.g. Living Room, Bedroom 1, Hallway, Kitchen)." },
                dimensions: { type: Type.STRING, description: "Original dimensions text as written on the plan, or 'Estimated' if none." },
                area: { type: Type.NUMBER, description: "Area of the room in square units (sqm or sqft)." },
                confidence: { type: Type.STRING, description: "Confidence for this room's calculation: 'high', 'medium', or 'low'." },
                calculation: { type: Type.STRING, description: "Short math formula used to compute area for this room." },
                sourceMethod: { type: Type.STRING, description: "How area was derived: 'measured' or 'estimated'." },
                bbox: {
                  type: Type.OBJECT,
                  description: "Approximate normalized room location in range 0..1.",
                  properties: {
                    x: { type: Type.NUMBER },
                    y: { type: Type.NUMBER },
                    width: { type: Type.NUMBER },
                    height: { type: Type.NUMBER }
                  }
                },
                notes: { type: Type.STRING, description: "Explanation or details about the room area calculation." }
              },
              required: ["name", "dimensions", "area", "confidence"]
            }
          }
        },
        required: ["success", "detectedScale", "dominantUnit", "areaUnit", "totalArea", "confidenceLevel", "summary", "rooms", "calibrationQuotes"]
      };
      console.log(`[AI calibration quotes] Using model: ${selectedModel}`);
      const maxCalibrationAttempts = 4;
      let calibrationData: any = null;
      let calibrationMetrics = { medianRatio: null as number | null, consistency: 0, sampleCount: 0 };
      let calibrationAttempt = 1;

      for (let attempt = 1; attempt <= maxCalibrationAttempts; attempt++) {
        const prompt = buildCalibrationPrompt(attempt);
        const contents = [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          ...referenceImageList.map((referenceImage: { dataUrl: string; mimeType: string }) => ({
            inlineData: {
              data: referenceImage.dataUrl.replace(/^data:.*?;base64,/, ""),
              mimeType: referenceImage.mimeType,
            },
          })),
          prompt,
        ];

        const response = await ai.models.generateContent({
          model: selectedModel,
          contents,
          config: {
            responseMimeType: "application/json",
            responseSchema,
          }
        });
        const responseText = response.text || "{}";
        const parsed = JSON.parse(responseText);
        const metrics = computeCalibrationMetrics(parsed.calibrationQuotes || []);

        calibrationData = parsed;
        calibrationMetrics = metrics;
        calibrationAttempt = attempt;

        if (metrics.sampleCount >= 10 && metrics.consistency >= 0.9) {
          break;
        }
      }

      const calibrationQuotes = Array.isArray(calibrationData?.calibrationQuotes) ? calibrationData.calibrationQuotes : [];
      const calibrationMmPerPixel = calibrationMetrics.medianRatio !== null ? parseFloat(calibrationMetrics.medianRatio.toFixed(4)) : null;
      const calibrationConsistency = Math.round(calibrationMetrics.consistency * 100);
      console.log(`[AI calibration quotes] Attempt ${calibrationAttempt}: ${calibrationMetrics.sampleCount} quotes, median mm/px = ${calibrationMmPerPixel}, consistency = ${calibrationConsistency}%`);
      let roomData: any = null;
      let roomAttempt = 1;

      if (calibrationMmPerPixel !== null && calibrationQuotes.length > 0) {
        for (let attempt = 1; attempt <= maxCalibrationAttempts; attempt++) {
          const prompt = buildRoomAnalysisPrompt(calibrationMmPerPixel, calibrationConsistency, calibrationQuotes, attempt);
          const contents = [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType,
              },
            },
            ...referenceImageList.map((referenceImage: { dataUrl: string; mimeType: string }) => ({
              inlineData: {
                data: referenceImage.dataUrl.replace(/^data:.*?;base64,/, ""),
                mimeType: referenceImage.mimeType,
              },
            })),
            prompt,
          ];

          const response = await ai.models.generateContent({
            model: selectedModel,
            contents,
            config: {
              responseMimeType: "application/json",
              responseSchema,
            }
          });
          const responseText = response.text || "{}";
          const parsed = JSON.parse(responseText);
          console.log(`[AI room extraction]`);

          roomData = parsed;
          roomAttempt = attempt;

          if (Array.isArray(parsed.rooms) && parsed.rooms.length > 0) {
            break;
          }
        }
      }
      console.log(`[AI room extraction] Attempt ${roomAttempt}: ${Array.isArray(roomData?.rooms) ? roomData.rooms.length : 0} rooms detected.`);
      const rooms = Array.isArray(roomData?.rooms) ? roomData.rooms : [];
      const data = {
        ...calibrationData,
        ...roomData,
        success: rooms.length > 0 || calibrationQuotes.length > 0,
        calibrationMmPerPixel,
        calibrationConsistency,
        calibrationQuotesUsed: calibrationMetrics.sampleCount,
        calibrationAttempts: calibrationAttempt,
        roomExtractionAttempts: roomAttempt,
        rooms,
        calibrationQuotes,
      };
      res.json(data);
    } catch (error: any) {
      console.error("Failed to analyze plan:", error);
      res.status(500).json({ error: error.message || "An unexpected error occurred during plan analysis." });
    }
  });

  // Vite configuration for development, otherwise serve built assets
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req: express.Request, res: express.Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Floor Plan Area Calculator running at http://localhost:${PORT}`);
  });
}

startServer();
