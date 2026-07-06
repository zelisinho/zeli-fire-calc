import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

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
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not defined in the environment. Please add it to your secrets.");
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
      const { fileData, mimeType } = req.body;
      if (!fileData || !mimeType) {
        return res.status(400).json({ error: "Missing fileData or mimeType of the floor plan file." });
      }

      // Strip off base64 prefix if present
      const base64Data = fileData.replace(/^data:.*?;base64,/, "");

      const ai = getGeminiClient();

      const prompt = `You are a professional architectural estimator and floor plan analyzer. 
Analyze the attached house designer plan (image or PDF) and calculate the total floor area.
Follow these steps carefully:
1. Examine the plan for room labels, text annotations, written dimensions (e.g. "12'0\\" x 14'6\\""), or metric annotations (e.g. "4.20 x 3.80").
2. Search for any scale notations (e.g., "1:100", "1/4\\" = 1'-0\\"") or graphic scale bars.
3. Identify every distinct room or hallway on the plan.
4. Extract written dimensions for each room.
5. Calculate the area for each room in square meters (sqm) or square feet (sqft) depending on the dominant unit on the plan. 
   - If dimensions are in feet/inches, calculate in square feet.
   - If dimensions are in meters, calculate in square meters.
   - If dimensions are not explicitly listed, make an intelligent professional estimation based on standard room sizes (e.g., a standard Master Bed is ~150-200 sqft / 14-18 sqm, Bath is ~40-60 sqft / 4-6 sqm) relative to the scale, and label the confidence as 'low'.
6. Sum up all individual room areas to calculate the total floor area.
7. Return a beautifully compiled room list and total area in the specified JSON schema. Set 'success' to true if you could read the plan.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
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
                    name: { type: Type.STRING, description: "Room/zone name (e.g. Living Room, Bedroom 1, Hallway, Kitchen)." },
                    dimensions: { type: Type.STRING, description: "Original dimensions text as written on the plan, or 'Estimated' if none." },
                    area: { type: Type.NUMBER, description: "Area of the room in square units (sqm or sqft)." },
                    confidence: { type: Type.STRING, description: "Confidence for this room's calculation: 'high', 'medium', or 'low'." },
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
