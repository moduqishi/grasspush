const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');


module.exports = async (req, res) => {
    // 仅允许 POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { targetUrl, proxyUrl, method = 'GET', headers = {}, body, multipart } = req.body;

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
            headers: { ...headers },
            body: undefined,
            agent: agent
        };

        // multipart 文件上传（用于企业微信 media/upload）
        if (multipart && typeof multipart === 'object') {
            const {
                fieldName = 'media',
                filename = 'upload.bin',
                contentType = 'application/octet-stream',
                contentBase64
            } = multipart;

            if (!contentBase64) {
                return res.status(400).json({ error: 'multipart.contentBase64 is required' });
            }

            const boundary = `----GrassPushBoundary${Date.now().toString(16)}`;
            const fileBuffer = Buffer.from(contentBase64, 'base64');
            const headerBuffer = Buffer.from(
                `--${boundary}\r\n` +
                `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
                `Content-Type: ${contentType}\r\n\r\n`,
                'utf8'
            );
            const footerBuffer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
            const multipartBody = Buffer.concat([headerBuffer, fileBuffer, footerBuffer]);

            fetchOptions.body = multipartBody;
            fetchOptions.headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
            fetchOptions.headers['Content-Length'] = String(multipartBody.length);
        } else if (body && typeof body === 'object') {
            // 如果 body 是对象，stringify
            fetchOptions.body = JSON.stringify(body);
            if (!fetchOptions.headers['Content-Type']) {
                fetchOptions.headers['Content-Type'] = 'application/json';
            }
        } else if (body) {
            // 如果是字符串，直接用
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
