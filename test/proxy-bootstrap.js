const path = require('path');
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
if (proxy) {
  const { HttpsProxyAgent } = require(path.join(__dirname, 'node_modules', 'https-proxy-agent', 'dist', 'index.js'));
  const agent = new HttpsProxyAgent(proxy);
  const http = require('http');
  const https = require('https');
  const origHttpRequest = http.request;
  const origHttpsRequest = https.request;
  http.request = function(...args) {
    const options = args.find(a => typeof a === 'object' && a !== null && !Array.isArray(a));
    if (options && !options.agent) {
      options.agent = agent;
    }
    return origHttpRequest.apply(this, args);
  };
  https.request = function(...args) {
    const options = args.find(a => typeof a === 'object' && a !== null && !Array.isArray(a));
    if (options && !options.agent) {
      options.agent = agent;
    }
    return origHttpsRequest.apply(this, args);
  };
}
