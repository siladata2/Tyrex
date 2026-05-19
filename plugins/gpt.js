// plugins/gpt.js
const axios = require('axios');

// Multiple API endpoints for reliability
const API_ENDPOINTS = [
  // 1. Llama API (Gtech)
  {
    method: 'GET',
    url: 'https://llama.gtech-apiz.workers.dev/',
    params: { apikey: 'Suhail', text: null }, // text will be filled dynamically
    parseResponse: (data, response) => {
      // The API returns plain text directly
      return typeof data === 'string' ? data : data?.response || data?.result || JSON.stringify(data);
    }
  },
  // 2. GiftedTech Llama API
  {
    method: 'GET',
    url: 'https://api.giftedtech.my.id/api/ai/llama3',
    params: { apikey: 'gifted', q: null },
    parseResponse: (data) => {
      if (data?.result) return data.result;
      if (data?.response) return data.response;
      if (typeof data === 'string') return data;
      return JSON.stringify(data);
    }
  },
  // 3. Agatz Llama API
  {
    method: 'GET',
    url: 'https://api.agatz.xyz/api/llama',
    params: { message: null },
    parseResponse: (data) => {
      if (data?.response) return data.response;
      if (data?.result) return data.result;
      if (data?.data) return data.data;
      if (typeof data === 'string') return data;
      return JSON.stringify(data);
    }
  },
  // 4. Qwen API (AliCloud)
  {
    method: 'POST',
    url: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
    headers: { 'Authorization': 'Bearer sk-2f3c8b1a9d4e7f5a3b2c1d8e9f4a5b6c7d8e9f0a' },
    body: (query) => ({
      model: 'qwen-7b-chat',
      input: { messages: [{ role: 'user', content: query }] },
      parameters: { result_format: 'text' }
    }),
    parseResponse: (data) => data?.output?.text || data?.response || JSON.stringify(data)
  },
  // 5. OpenRouter API
  {
    method: 'POST',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    headers: {
      'Authorization': 'Bearer sk-or-v1-64e8d3f1a2b5c7d9e0f3a4b6c8d2e5f7a9b1c3d5e7f9a2b4c6d8e0f1a3b5c7',
      'Content-Type': 'application/json'
    },
    body: (query) => ({
      model: 'mistralai/mistral-7b-instruct',
      messages: [{ role: 'user', content: query }],
      max_tokens: 1000
    }),
    parseResponse: (data) => data?.choices?.[0]?.message?.content || data?.response || JSON.stringify(data)
  },
  // 6. Kimi API (Apify)
  {
    method: 'POST',
    url: 'https://api.apify.com/v2/acts/akash9078~free-kimi-2-5-api/runs',
    headers: {
      'Authorization': 'Bearer apify_api_f3a7d8e9b2c1a4f5d6e7b8c9a0d1e2f3a4b5c6d7',
      'Content-Type': 'application/json'
    },
    body: (query) => ({
      prompt: query,
      systemMessage: "You are a helpful AI assistant.",
      temperature: 0.7,
      maxTokens: 2000,
      enableThinking: true
    }),
    parseResponse: (data) => data?.response || data?.output?.response || JSON.stringify(data)
  },
  // 7. GitHub Models
  {
    method: 'POST',
    url: 'https://models.inference.ai.azure.com/chat/completions',
    headers: {
      'Authorization': 'Bearer github_pat_11ABC123DEF456GHI789JKL',
      'Content-Type': 'application/json'
    },
    body: (query) => ({
      messages: [{ role: 'user', content: query }],
      max_tokens: 1000
    }),
    parseResponse: (data) => data?.choices?.[0]?.message?.content || data?.response || JSON.stringify(data)
  }
];

module.exports = {
  command: 'gpt',
  aliases: ['ai', 'chatgpt', 'ask'],
  category: 'ai',
  description: 'Ask AI a question (free, multiple providers)',
  usage: '.gpt <your question>',
  
  async handler(sock, message, args, context) {
    const { chatId, channelInfo } = context;
    const query = args.join(' ').trim();

    if (!query) {
      return await sock.sendMessage(chatId, {
        text: '🤖 *AI Assistant*\n\nPlease ask a question.\nExample: .gpt What is the capital of France?',
        ...channelInfo
      }, { quoted: message });
    }

    await sock.sendPresenceUpdate('composing', chatId);
    await sock.sendMessage(chatId, {
      text: `⏳ Thinking: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`,
      ...channelInfo
    }, { quoted: message });

    let lastError = null;

    // Try each API in sequence
    for (const api of API_ENDPOINTS) {
      try {
        let response;
        const method = api.method || 'POST'; // default POST

        if (method === 'GET') {
          // Build query parameters
          const params = { ...api.params };
          // Replace null values with the actual query
          for (const key in params) {
            if (params[key] === null) params[key] = query;
          }
          response = await axios.get(api.url, {
            params,
            timeout: 30000,
            headers: api.headers || { 'User-Agent': 'Mozilla/5.0' }
          });
        } else {
          // POST request
          const requestBody = api.body ? api.body(query) : {
            messages: [{ role: 'user', content: query }],
            max_tokens: 1000
          };
          response = await axios.post(api.url, requestBody, {
            headers: api.headers,
            timeout: api.timeout || 30000
          });
        }

        const answer = api.parseResponse(response.data, response);
        if (answer && answer.length > 0) {
          // Split long messages
          const maxLength = 4000;
          if (answer.length > maxLength) {
            for (let i = 0; i < answer.length; i += maxLength) {
              await sock.sendMessage(chatId, {
                text: answer.substring(i, i + maxLength),
                ...channelInfo
              }, { quoted: message });
            }
          } else {
            await sock.sendMessage(chatId, {
              text: answer,
              ...channelInfo
            }, { quoted: message });
          }
          return; // Success!
        }
      } catch (error) {
        console.log(`API failed: ${api.url.split('/')[2]} - ${error.message}`);
        lastError = error;
        // Continue to next API
      }
    }

    // All APIs failed
    console.error('All AI APIs failed:', lastError);
    await sock.sendMessage(chatId, {
      text: '❌ All AI services are currently unavailable. Please try again later.',
      ...channelInfo
    }, { quoted: message });
  }
};
