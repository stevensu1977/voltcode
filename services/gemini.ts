import { GoogleGenAI } from "@google/genai";

// Initialize the Gemini client
// The API key is obtained from Vite environment variable VITE_GEMINI_API_KEY
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

const SYSTEM_INSTRUCTION = `
You are an expert Frontend React and Web Developer Agent.
Your goal is to help users build web applications interactively.

When the user asks you to create a demo, app, or component:
1. Explain briefly what you are building.
2. Provide the COMPLETE source code in a SINGLE HTML file (including embedded CSS in <style> and JS in <script>).
3. Wrap the code strictly in a markdown code block like this:
\`\`\`html
<!DOCTYPE html>
<html>
...
</html>
\`\`\`
4. Ensure the code is modern, uses Tailwind CSS via CDN if styling is needed, and is visually appealing.
5. If the user asks for a modification, regenerate the entire HTML file with the changes applied.
6. Be concise in your conversational text.
`;

export const sendMessageToGemini = async (
  prompt: string,
  history: { role: string; parts: { text: string }[] }[] = []
): Promise<string> => {
  try {
    const modelId = 'gemini-3-pro-preview'; // Using Pro for better coding capabilities
    
    // Map our simple history format to the SDK's expected format
    const contents = history.map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: h.parts
    }));

    // Add the new user message
    contents.push({
      role: 'user',
      parts: [{ text: prompt }]
    });

    const response = await ai.models.generateContent({
      model: modelId,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        thinkingConfig: { thinkingBudget: 1024 } // Use a small thinking budget for reasoning
      },
      contents: contents
    });

    return response.text || "No response generated.";
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw new Error(error.message || "Unknown error occurred with Gemini.");
  }
};