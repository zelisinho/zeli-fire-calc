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

async function startServer() {
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
      const { fileData, mimeType, model } = req.body;
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

      const ai = getGeminiClient();

      const prompt = `You are a professional architectural estimator and floor plan analyzer.
    Analyze the attached house plan (image or PDF first page) and calculate room areas as precisely as possible.

    Priority rules (must follow):
    1. Detect room identifiers such as "1.01", "1.02", "1.03" and return them in a dedicated roomCode field.
    2. Prefer explicit written dimensions near each room (especially metric values in mm like "2570" and "2200").
    3. If dimensions are in mm, compute exact area in m2 using:
       area_m2 = (length_mm * width_mm) / 1_000_000
    4. Include the concrete formula used per room in a short calculation string (example: "2570 x 2200 / 1,000,000 = 5.65 m2").
    5. If dimensions are in feet/inches, compute in sqft and provide the formula.
    6. Use estimation only when no readable dimensions exist, and mark sourceMethod as "estimated".
    7. Return all identifiable rooms/zones (including terraces/shelters if present) and a total area.

    Output rules:
    - Keep numbers realistic and internally consistent.
    - For mm-based rooms, keep high confidence unless text is unclear.
    - Set success=true only if at least some rooms were parsed.`;

      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          prompt,
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              success: { type: Type.BOOLEAN },
              detectedScale: { type: Type.STRING, description: "Any scale detected on the plan (e.g. 1:100, 1/4 inch, or 'Not found')." },
              dominantUnit: { type: Type.STRING, description: "The dominant measurement unit found: 'meters' or 'feet'." },
              areaUnit: { type: Type.STRING, description: "The unit of calculated area: 'sqm' or 'sqft'." },
              totalArea: { type: Type.NUMBER, description: "Calculated sum of all individual room areas." },
              confidenceLevel: { type: Type.STRING, description: "Overall confidence: 'high', 'medium', or 'low'." },
              summary: { type: Type.STRING, description: "High-level summary of the architectural analysis, room composition, and how areas were derived." },
              rooms: {
                type: Type.ARRAY,
                description: "Array of all identified rooms and zones with dimensions and areas.",
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
                    notes: { type: Type.STRING, description: "Explanation or details about the room area calculation." }
                  },
                  required: ["name", "dimensions", "area", "confidence"]
                }
              }
            },
            required: ["success", "detectedScale", "dominantUnit", "areaUnit", "totalArea", "confidenceLevel", "summary", "rooms"]
          }
        }
      });

      const responseText = response.text || "{}";
      const data = JSON.parse(responseText);
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
