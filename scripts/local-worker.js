#!/usr/bin/env node
import { createServer } from 'http';
import fs from 'fs';
import path from 'path';

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
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        message: 'Local worker server - API endpoints will be implemented',
        path: url.pathname,
        method: req.method
      }));
    }
  } catch (error) {
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
