"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateWhatsAppMessage = void 0;
const generative_ai_1 = require("@google/generative-ai");
const getApiKey = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.trim() === '') {
        throw new Error('GEMINI_API_KEY not configured in environment variables');
    }
    return apiKey;
};
let genAI = null;
const getGeminiClient = () => {
    if (!genAI) {
        const apiKey = getApiKey();
        genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
    }
    return genAI;
};
const generateWhatsAppMessage = async (context, tone) => {
    try {
        if (!context || context.trim() === '') {
            return 'Olá! Como posso ajudar você hoje?';
        }
        if (!tone || tone.trim() === '') {
            tone = 'friendly';
        }
        const client = getGeminiClient();
        const model = client.getGenerativeModel({ model: 'gemini-pro' });
        const prompt = `Write a short, engaging, and professional pre-filled WhatsApp message for a customer starting a conversation about: "${context}". The tone should be ${tone}. Only return the message text in Portuguese (Brazil), no quotes or explanations. Maximum 100 characters.`;
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const generatedText = response.text()?.trim();
        if (!generatedText) {
            return `Olá! Gostaria de saber mais sobre ${context}.`;
        }
        return generatedText;
    }
    catch (error) {
        console.error('Error generating message:', error);
        if (error.message?.includes('API key')) {
            throw new Error('Configuração inválida da API Gemini');
        }
        if (error.status === 429) {
            throw new Error('Limite de requisições excedido. Tente novamente mais tarde.');
        }
        if (error.status === 401 || error.status === 403) {
            throw new Error('API key inválida ou sem permissão');
        }
        return `Olá! Gostaria de conversar sobre ${context}. Como posso ajudar?`;
    }
};
exports.generateWhatsAppMessage = generateWhatsAppMessage;
