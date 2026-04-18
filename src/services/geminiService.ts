
import { GoogleGenAI } from "@google/genai";

// Safely retrieve API Key to prevent "ReferenceError: process is not defined"
const getApiKey = () => {
  try {
    if (typeof process !== "undefined" && process.env) {
      return process.env.API_KEY;
    }
  } catch (e) {
    console.warn("Failed to access process.env");
  }
  return "";
};

const apiKey = getApiKey();

// Initialize AI instance safely. 
// If apiKey is missing, we use a placeholder to prevent the constructor from throwing immediately.
// Actual calls will fail gracefully.
const ai = new GoogleGenAI({ apiKey: apiKey || "MISSING_API_KEY" });

export const analyzeMarketSentiment = async (pair: string, currentPrice: number, recentTrend: string): Promise<string> => {
  if (!apiKey) return "AI Unavailable: API Key not configured.";
  
  try {
    const model = "gemini-3-flash-preview";
    const prompt = `
      You are an expert crypto analyst on the VELO Solana exchange.
      Analyze the following market condition for ${pair}.
      Current Price: $${currentPrice}
      Recent Trend: ${recentTrend}
      
      Provide a concise, 2-sentence technical analysis with a sentiment score (1-100) and a recommendation (BUY/SELL/HOLD).
      Keep it professional but geared towards high-frequency traders.
    `;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });

    return response.text || "Market analysis unavailable.";
  } catch (error) {
    console.error("Gemini analysis failed:", error);
    return "AI Analysis systems are currently offline.";
  }
};

export const generateBotStrategy = async (instruction: string): Promise<string> => {
  if (!apiKey) return JSON.stringify({ name: "Error", description: "API Key Missing" });

  try {
    const model = "gemini-3-flash-preview";
    const prompt = `
      Create a trading bot strategy description for a Solana perpetual protocol named VELO.
      User Instruction: ${instruction}
      
      Include:
      1. Strategy Name
      2. Indicators used (RSI, MACD, Bollinger Bands, etc.)
      3. Entry/Exit triggers
      4. Expected APY (be realistic but optimistic for crypto)
      
      Format as a JSON object string with keys: name, description, apy (number), winRate (number).
    `;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });

    return response.text || "{}";
  } catch (error) {
    console.error("Gemini strategy generation failed:", error);
    return JSON.stringify({ name: "Error", description: "Could not generate strategy." });
  }
};

export const chatWithAi = async (message: string, context: string): Promise<string> => {
    if (!apiKey) return "I cannot reply right now (Missing API Key).";

    try {
        const model = "gemini-3-flash-preview";
        const response = await ai.models.generateContent({
            model,
            contents: `System: You are VELO AI, a helpful assistant on a crypto exchange. Context: ${context}. User: ${message}`
        });
        return response.text || "I didn't catch that.";
    } catch (e) {
        return "System overload. Please try again.";
    }
}
