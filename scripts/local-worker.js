#!/usr/bin/env node
import { createServer } from 'http';
import fs from 'fs';
import path from 'path';

function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': 'http://localhost:8080',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  const env = {
    API_KEY: process.env.API_KEY || 'demo_api_key',
    KNOWLEDGE_API_KEY: process.env.KNOWLEDGE_API_KEY || 'demo_knowledge_key',
    GCP_API_KEY: process.env.GCP_API_KEY || 'demo_gcp_key',
    DATASET_ID: process.env.DATASET_ID || 'demo_dataset',
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || 'http://localhost:8080'
  };

  try {
    const url = new URL(req.url, `http://localhost:8787`);
    
    if (url.pathname === '/api-status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        message: 'Local development server running',
        environment: 'development'
      }));
    } else if (url.pathname === '/chat-messages' && req.method === 'POST') {
      const body = await getRequestBody(req);
      console.log('Chat message received:', body.query);
      
      res.writeHead(200, {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      const mockResponse = `こんにちは！ローカル開発環境でのテストメッセージを受信しました: "${body.query}"\n\nシルファーシステムが正常に動作しています。APIエンドポイントの接続確認が完了しました。`;
      
      const chunks = [
        `data: {"event":"message","message_id":"msg_local_${Date.now()}","conversation_id":"conv_local_${Date.now()}","answer":"${mockResponse}","created_at":${Date.now()}}\n\n`,
        `data: {"event":"message_end","message_id":"msg_local_${Date.now()}","conversation_id":"conv_local_${Date.now()}"}\n\n`
      ];

      let i = 0;
      const sendChunk = () => {
        if (i < chunks.length) {
          res.write(chunks[i]);
          i++;
          setTimeout(sendChunk, 500);
        } else {
          res.end();
        }
      };
      
      setTimeout(sendChunk, 100);
      
    } else if (url.pathname === '/conversation-list' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        data: [],
        has_more: false,
        limit: 20,
        total: 0
      }));
    } else if (url.pathname === '/conversation-history' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        data: [],
        has_more: false,
        limit: 20,
        total: 0
      }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        message: 'Local worker server - API endpoint not implemented',
        path: url.pathname,
        method: req.method,
        available_endpoints: ['/api-status', '/chat-messages', '/conversation-list', '/conversation-history']
      }));
    }
  } catch (error) {
    console.error('Error handling request:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
});

const PORT = 8787;
server.listen(PORT, () => {
  console.log(`Local worker server running on http://localhost:${PORT}`);
  console.log('Environment variables:');
  console.log('- API_KEY:', process.env.API_KEY ? '***' : 'not set');
  console.log('- KNOWLEDGE_API_KEY:', process.env.KNOWLEDGE_API_KEY ? '***' : 'not set');
  console.log('- GCP_API_KEY:', process.env.GCP_API_KEY ? '***' : 'not set');
  console.log('- DATASET_ID:', process.env.DATASET_ID || 'not set');
  console.log('- ALLOWED_ORIGINS:', process.env.ALLOWED_ORIGINS || 'not set');
});
