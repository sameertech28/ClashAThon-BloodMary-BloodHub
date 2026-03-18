const axios = require('axios');
require('dotenv').config();

const key = process.env.OPENROUTER_API_KEY;
console.log('Testing Key:', key);

async function test() {
    const models = [
        "google/gemma-7b-it:free",
        "mistralai/mistral-7b-instruct:free",
        "meta-llama/llama-3-8b-instruct:free",
        "qwen/qwen-2-7b-instruct:free"
    ];

    for (const model of models) {
        try {
            console.log(`Checking ${model}...`);
            const res = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
                model: model,
                messages: [{ role: "user", content: "hi" }]
            }, {
                headers: {
                    "Authorization": `Bearer ${key}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "http://localhost:3300",
                    "X-Title": "Test",
                },
                timeout: 5000
            });
            console.log(`✅ ${model} works!`);
            console.log('Response:', res.data.choices[0].message.content);
            return;
        } catch (e) {
            console.log(`❌ ${model} failed:`, e.response?.data || e.message);
        }
    }
}

test();
