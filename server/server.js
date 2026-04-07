const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors()); // Povolí tvému HTML webu mluvit s tímto serverem

// Konfigurace (pokud běží v Dockeru, použije názvy služeb, jinak localhost)
const SEARXNG_URL = process.env.SEARXNG_URL || "http://localhost:8080";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const MODEL_NAME = "mistral"; // Nebo 'llama3'

app.post('/api/chat', async (req, res) => {
    const { query } = req.body;
    
    if (!query) {
        return res.status(400).json({ error: "Query is required" });
    }

    console.log(`[Rentstag AI] Dotaz: ${query}`);

    let searchResults = [];
    
    // 1. Krok: Hledání informací (SearXNG)
    try {
        const searchUrl = `${SEARXNG_URL}/search`;
        // Omezíme hledání na rentstag.com a přidáme dotaz
        const params = {
            q: `site:rentstag.com ${query}`,
            format: 'json',
            language: 'en' // nebo 'cs'
        };

        const searchResp = await axios.get(searchUrl, { params });
        // Vezmeme první 4 výsledky
        if (searchResp.data.results) {
            searchResults = searchResp.data.results.slice(0, 4);
        }
    } catch (err) {
        console.error("Chyba při hledání (SearXNG):", err.message);
        // Pokračujeme dál i bez výsledků, AI zkusí odpovědět z hlavy
    }

    // 2. Krok: Příprava dat pro AI
    const contextText = searchResults.map(r => `- ${r.title}: ${r.content}`).join("\n");
    
    const systemPrompt = `You are Rentstag AI, a helpful assistant for a property management company. 
    Use the provided search results to answer the user's question clearly and professionally.
    If the answer isn't in the context, say you don't know but offer to contact support@rentstag.com.
    Answer in the same language as the user's question (likely Czech or English).`;

    const fullPrompt = `Context:\n${contextText}\n\nUser Question: ${query}\n\nAnswer:`;

    // 3. Krok: Dotaz na Ollamu (AI)
    try {
        const aiResp = await axios.post(`${OLLAMA_URL}/api/chat`, {
            model: MODEL_NAME,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: fullPrompt }
            ],
            stream: false
        });

        // 4. Krok: Odeslání odpovědi zpět na web
        res.json({
            response: aiResp.data.message.content,
            sources: searchResults.map(r => ({ title: r.title, url: r.url }))
        });

    } catch (err) {
        console.error("Chyba AI (Ollama):", err.message);
        res.status(500).json({ error: "AI service is currently unavailable." });
    }
});

const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Rentstag AI Server běží na portu ${PORT}`);
});