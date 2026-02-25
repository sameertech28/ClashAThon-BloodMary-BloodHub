// controllers/chatController.js
const pool = require("../config/db");
require("dotenv").config();

const MODELS = [
    "google/gemma-3-4b-it:free"
];

const SYSTEM_PROMPT = `You are the BLOODHUB AI Assistant, an expert helper for Nepal's blood donation platform.

Your responsibilities:
- Help donors find blood donation centers and camps across Nepal
- Assist hospitals in posting and managing blood requests
- Educate users about blood types (A, B, AB, O — positive & negative) and compatibility
- Guide users on donation eligibility, safety, and post-donation care
- Help connect urgent blood requests with nearby available donors
- Provide info on blood banks in major cities: Kathmandu, Pokhara, Lalitpur, Bhaktapur, Biratnagar, etc.

Rules:
- Be concise, empathetic, and professional
- If there is a medical emergency, immediately advise contacting the nearest hospital or calling 102 (Nepal ambulance)
- Never provide specific medical diagnoses
- If asked about platform features (registering as donor, posting requests), guide users through the BloodHub interface
- Always respond in the same language the user writes in (Nepali or English)`;

exports.handleChat = async (req, res) => {
    const { message, history = [] } = req.body;
    console.log("Chat Request received:", { message, historyLength: history.length });

    if (!message) {
        return res.status(400).json({ error: "Message is required" });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey || apiKey === "your_openrouter_api_key_here") {
        return res.status(500).json({ error: "AI Chat is not configured." });
    }

    try {
        // 1. Fetch Real-time Database Context
        const [donorCount] = await pool.query("SELECT COUNT(*) as count FROM donors");
        const [hospitalCount] = await pool.query("SELECT COUNT(*) as count FROM hospitals");
        const [activeRequests] = await pool.query(`
            SELECT blood_type, city, urgency, COUNT(*) as count 
            FROM requests 
            WHERE status != 'Fulfilled' 
            GROUP BY blood_type, city, urgency 
            LIMIT 10
        `);

        // 2. Construct Dynamic System Prompt
        const statsContext = `
Current Platform Statistics:
- Registered Donors: ${donorCount[0].count}
- Partner Hospitals: ${hospitalCount[0].count}

Active Blood Requests:
${activeRequests.length > 0
                ? activeRequests.map(r => `- ${r.blood_type} needed in ${r.city} (Urgency: ${r.urgency})`).join("\n")
                : "- No active emergency requests at the moment."}
`;

        const dynamicSystemPrompt = `${SYSTEM_PROMPT}\n\n${statsContext}`;

        let lastError = null;

        for (const model of MODELS) {
            // Try with System Prompt first
            const result = await tryModel(model, apiKey, [
                { role: "system", content: dynamicSystemPrompt },
                ...history.slice(-5),
                { role: "user", content: message }
            ]);

            if (result.ok) return res.json(result.data);

            // Fallback: If "Developer instruction" error, try merging system prompt into user message
            if (result.error && JSON.stringify(result.error).includes("Developer instruction")) {
                console.warn(`Fallback for model ${model}: merging system prompt into user message`);
                const fallbackResult = await tryModel(model, apiKey, [
                    ...history.slice(-5),
                    { role: "user", content: `Instructions: ${dynamicSystemPrompt}\n\nUser Message: ${message}` }
                ]);
                if (fallbackResult.ok) return res.json(fallbackResult.data);
                lastError = fallbackResult.error;
            } else {
                lastError = result.error;
            }
        }

        res.status(500).json({ error: "AI Assistant unavailable.", details: lastError });

    } catch (dbErr) {
        console.error("Database error in Chat Controller:", dbErr);
        // If DB fails, still try to respond but without live stats
        return handleStaticChat(req, res, message, history, apiKey);
    }
};

async function handleStaticChat(req, res, message, history, apiKey) {
    let lastError = null;
    for (const model of MODELS) {
        const result = await tryModel(model, apiKey, [
            { role: "system", content: SYSTEM_PROMPT },
            ...history.slice(-5),
            { role: "user", content: message }
        ]);
        if (result.ok) return res.json(result.data);
        lastError = result.error;
    }
    res.status(500).json({ error: "AI Assistant unavailable.", details: lastError });
}

async function tryModel(model, apiKey, messages) {
    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost:3300",
                "X-Title": "BLOODHUB Assistant",
            },
            body: JSON.stringify({ model, messages })
        });

        const data = await response.json();
        if (!response.ok || data.error) return { ok: false, error: data.error || data };

        return {
            ok: true,
            data: { response: data.choices[0].message.content, model }
        };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}
