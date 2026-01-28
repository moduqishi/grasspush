const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent'); // 实际上 https-proxy-agent 通常也处理 http，但为了保险

module.exports = async (req, res) => {
    // 仅允许 POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { targetUrl, proxyUrl, method = 'GET', headers = {}, body } = req.body;

        if (!targetUrl) {
            return res.status(400).json({ error: 'Missing targetUrl' });
        }

        // 默认使用用户提供的代理，或者从环境变量读取默认代理
        const finalProxyUrl = proxyUrl || process.env.DEFAULT_PROXY_URL;

        if (!finalProxyUrl) {
            return res.status(400).json({ error: 'Missing proxyUrl' });
        }

        console.log(`Relaying to ${targetUrl} via ${finalProxyUrl}`);

        // 创建代理 Agent
        const agent = new HttpsProxyAgent(finalProxyUrl);

        // 发起请求
        const fetchOptions = {
            method,
            headers: headers,
            body: body ? JSON.stringify(body) : undefined,
            agent: agent
        };

        // 如果 body 是对象，stringify；如果是字符串，直接用
        if (body && typeof body === 'object') {
            fetchOptions.body = JSON.stringify(body);
            // 确保 Content-Type
            if (!fetchOptions.headers['Content-Type']) {
                fetchOptions.headers['Content-Type'] = 'application/json';
            }
        } else if (body) {
            fetchOptions.body = body;
        }

        const response = await fetch(targetUrl, fetchOptions);

        // 获取响应内容
        const responseText = await response.text();
        let responseData;
        try {
            responseData = JSON.parse(responseText);
        } catch {
            responseData = responseText;
        }

        // 返回结果
        res.status(response.status).json(responseData);

    } catch (error) {
        console.error('Relay Error:', error);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
};
