#!/usr/bin/env node

/**
 * Health check script for DevPocket Server
 * Used by Docker containers to verify service health
 */

const http = require('http');
const { URL } = require('url');

const HEALTH_CHECK_URL = process.env.HEALTH_CHECK_URL || 'http://localhost:8000/api/v1/health';
const TIMEOUT = parseInt(process.env.HEALTH_CHECK_TIMEOUT) || 5000;

function healthCheck() {
  return new Promise((resolve, reject) => {
    const url = new URL(HEALTH_CHECK_URL);
    
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'GET',
      timeout: TIMEOUT,
      headers: {
        'User-Agent': 'Docker-Healthcheck/1.0'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          
          if (res.statusCode === 200 && response.status === 'healthy') {
            console.log('✅ Health check passed');
            resolve(response);
          } else {
            console.error('❌ Health check failed - unhealthy response');
            console.error('Status:', res.statusCode);
            console.error('Response:', response);
            reject(new Error(`Health check failed: ${response.status || 'unknown'}`));
          }
        } catch (error) {
          console.error('❌ Health check failed - invalid JSON response');
          console.error('Response:', data);
          reject(new Error('Invalid JSON response'));
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Health check failed - network error');
      console.error('Error:', error.message);
      reject(error);
    });

    req.on('timeout', () => {
      console.error('❌ Health check failed - timeout');
      req.destroy();
      reject(new Error('Health check timeout'));
    });

    req.end();
  });
}

// Run the health check
healthCheck()
  .then((response) => {
    console.log('Health check details:', JSON.stringify(response, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    console.error('Health check error:', error.message);
    process.exit(1);
  });