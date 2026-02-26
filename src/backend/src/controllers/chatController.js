const pool = require("../config/db");
const axios = require("axios");
require("dotenv").config();

const MODELS = [
    "google/gemma-3-4b-it:free",
    "mistralai/mistral-7b-instruct:free",
    "huggingfaceh4/zephyr-7b-beta:free",
    "openchat/openchat-7b:free"
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

            console.error(`AI Model Failure (${model}):`, result.error);
            lastError = result.error;

            // Fallback: If "Developer instruction" error, try merging system prompt into user message
            if (result.error && JSON.stringify(result.error).includes("Developer instruction")) {
                console.warn(`Fallback for model ${model}: merging system prompt into user message`);
                const fallbackResult = await tryModel(model, apiKey, [
                    ...history.slice(-5),
                    { role: "user", content: `Instructions: ${dynamicSystemPrompt}\n\nUser Message: ${message}` }
                ]);
                if (fallbackResult.ok) return res.json(fallbackResult.data);
                console.error(`AI Model Fallback Failure (${model}):`, fallbackResult.error);
                lastError = fallbackResult.error;
            }
        }

        // 3. Final Fallback: Rule-based local response if all AI models fail
        console.log("All AI models failed. Triggering local rule-based fallback...");
        const stats = {
            donors: donorCount[0].count,
            hospitals: hospitalCount[0].count,
            requests: activeRequests
        };
        const localResponse = getLocalResponse(message, stats);
        return res.json({ response: localResponse, model: "local-fallback" });

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
        console.error(`AI Static Chat Failure (${model}):`, result.error);
        lastError = result.error;
    }
    // Static local fallback if DB failed too
    const localResponse = getLocalResponse(message, null);
    return res.json({ response: localResponse, model: "local-static-fallback" });
}

function getLocalResponse(msg, stats) {
    const m = msg.toLowerCase();

    // 1. CONVERSATIONAL LAYER (Greetings, Small Talk)
    if (m.match(/\b(hi|hello|hey|namaste|asalam|hi there)\b/)) {
        return "Namaste! I'm your BloodHub Assistant. We currently have " +
            (stats ? `${stats.donors} donors and ${stats.hospitals} hospitals` : "a growing community") +
            " on our platform. How can I help you save a life or navigate our platform today?";
    }
    if (m.includes("who are you") || m.includes("what are you") || m.includes("your name")) {
        return "I am the BloodHub AI Assistant, specifically designed to help citizens of Nepal connect with blood donation opportunities. I'm here to guide you through registration, find urgent requests, and answer health-related questions!";
    }
    if (m.includes("how are you")) {
        return "I'm doing great, especially when I see more people registering to save lives! How are you doing? Ready to become a hero today?";
    }

    // 2. DATA LAYER (Real-time Stats)
    if (m.includes("how many") || m.includes("count") || m.includes("statistic") || m.includes("total")) {
        if (!stats) return "I can't access live stats right now, but our community is growing every hour with new heroes joining the cause!";
        return `As of this moment, we have ${stats.donors} registered life-savers (donors) and ${stats.hospitals} partner hospitals across Nepal. Together, we've built a strong emergency network!`;
    }

    // 3. EMERGENCY & URGENCE LAYER
    if (m.includes("request") || m.includes("needed") || m.includes("requirement") || m.includes("urgent")) {
        if (stats && stats.requests && stats.requests.length > 0) {
            const top = stats.requests[0];
            const others = stats.requests.length - 1;
            return `YES, there is an urgent need! Currently, ${top.blood_type} is required in ${top.city} (${top.urgency} urgency). ` +
                (others > 0 ? `Plus ${others} other active requests. ` : "") +
                "Please go to the 'For Donors' page immediately to see details and help!";
        }
        return "Great news: my immediate records don't show any unfulfilled emergency requests right now. However, I recommend checking the 'Active Requests' page, as new emergencies can be posted at any time!";
    }
    if (m.includes("emergency") || m.includes("ambulance") || m.includes("102")) {
        return "🚨 IF THIS IS A MEDICAL EMERGENCY, call 102 (Nepal Ambulance Service) immediately. While BloodHub helps coordinate blood supply, acute medical treatment should always be sought at the nearest hospital ER.";
    }

    // 4. DONATION & ELIGIBILITY LAYER
    if (m.includes("donate") || m.includes("how to help") || m.includes("process")) {
        return "Helping is simple! \n1. Register as a Donor.\n2. Verify your profile (add your blood type and city).\n3. Browse 'Active Requests' for matches.\n4. Click 'I'M COMING' to alert the hospital you are on your way!";
    }
    if (m.includes("eligible") || m.includes("can i") || m.includes("requirement") || m.includes("weight") || m.includes("age")) {
        return "Basic Eligibility in Nepal:\n- Age: 18 to 60 years old.\n- Weight: 50kg (110 lbs) or more.\n- Health: Generally healthy, no active infections.\n- Gap: At least 3 months since your last donation.\nRemember to eat well and drink plenty of water before you go!";
    }
    if (m.includes("safe") || m.includes("pain") || m.includes("scared")) {
        return "Blood donation is very safe! Sterile, single-use equipment is always used. The 'pinch' of the needle only lasts a second, but the blood you give can save up to 3 lives. You'll also get a short rest and snacks afterward!";
    }

    // 5. BLOOD TYPE & SCIENCE LAYER
    if (m.includes("blood type") || m.includes("compatibility") || m.includes("universal")) {
        return "Quick Science Fact: \n- O Negative is the 'Universal Donor' (anyone can receive it).\n- AB Positive is the 'Universal Recipient' (can receive from anyone).\n- A, B, AB, and O types are all vital. Do you know your blood type? It's the first step to help!";
    }
    if (m.match(/\b(a\+|a-|b\+|b-|ab\+|ab-|o\+|o-)\b/)) {
        return "That's a very important blood type! We often have requests for specific types like yours. Make sure it's correct in your profile so we can send you instant email alerts when a hospital nearby needs you!";
    }

    // 6. PLATFORM NAVIGATION LAYER
    if (m.includes("register") || m.includes("join") || m.includes("account")) {
        return "You can join our mission by clicking 'Donor Login' or 'Hospital Login' in the top bar. If you don't have an account, there's a 'Register Now' link on those pages. It only takes 2 minutes!";
    }
    if (m.includes("contact") || m.includes("support") || m.includes("help me")) {
        return "You can reach out to our team via the 'Contact' page if you have technical issues. For blood-related queries, I'm here 24/7! Is there any specific page you're looking for?";
    }

    // 7. NEPAL CONTEXT LAYER
    if (m.includes("kathmandu") || m.includes("pokhara") || m.includes("biratnagar") || m.includes("nepal")) {
        return "We operate across all of Nepal! From Kathmandu to the Terai, we are connecting hospitals with local donors to minimize transport time during emergencies. Do you need help finding a blood bank in your specific city?";
    }

    // 8. GRATITUDE & CLOSING
    if (m.includes("thank") || m.includes("dhanyabaad") || m.includes("bye") || m.includes("good bye")) {
        return "You're very welcome! Thank you for being a part of BloodHub. Together, we are building a safer Nepal. Dhanyabaad and stay healthy!";
    }

    // 9. DYNAMIC FALLBACKS (To avoid being repetitive)
    const fallbacks = [
        "That's a great question! I'm here to help with everything BloodHub—from registration and finding donors to checking live statistics. What would you like to know more about?",
        "I'm specialized in blood donation in Nepal. Did you know one pint of blood can save three lives? Are you interested in donating or are you representing a hospital?",
        "I'm your 24/7 assistant. While I'm currently running on my local 'knowledge core', I can provide live counts of donors and active requests. Feel free to ask about eligibility or how to get started!",
        "BloodHub is all about connection. Currently, we are scaling across Nepal to ensure no one waits for blood in an emergency. How can I guide you further today?"
    ];

    // Pick based on message length as a simple seed for pseudo-randomness
    const index = (msg.length + m.charCodeAt(0)) % fallbacks.length;
    return fallbacks[index];
}

async function tryModel(model, apiKey, messages) {
    try {
        console.log(`[AI Chat] Calling OpenRouter: ${model}...`);
        const response = await axios.post("https://openrouter.ai/api/v1/chat/completions",
            { model, messages },
            {
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "http://localhost:3300",
                    "X-Title": "BLOODHUB Assistant",
                },
                timeout: 10000
            }
        );

        const data = response.data;
        if (data.error) {
            console.error(`[AI Chat] ${model} API Error:`, data.error);
            return { ok: false, error: data.error };
        }

        if (!data.choices || !data.choices[0]) {
            console.error(`[AI Chat] ${model} empty response. Full body:`, JSON.stringify(data));
            return { ok: false, error: "Empty response" };
        }

        console.log(`[AI Chat] ${model} Success!`);
        return {
            ok: true,
            data: { response: data.choices[0].message.content, model }
        };
    } catch (err) {
        const status = err.response ? err.response.status : "No Status";
        const errorData = err.response ? JSON.stringify(err.response.data) : err.message;
        console.error(`[AI Chat] ${model} HTTP ${status} Error:`, errorData);
        return { ok: false, error: `HTTP ${status}: ${errorData}` };
    }
}
