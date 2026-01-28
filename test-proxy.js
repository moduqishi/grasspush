const https = require('https');
const http = require('http');
const { URL } = require('url');

const proxyUrl = 'http://vojdixrl:pdw5fv61kkit@72.1.129.179:7572';
const targetUrlHttp = 'http://ipv4.webshare.io/';
const targetUrlHttps = 'https://qyapi.weixin.qq.com/cgi-bin/gettoken'; // 测试接口，不用参数也行，看能否连接

console.log('Testing Proxy:', proxyUrl);

// 解析代理配置
const proxy = new URL(proxyUrl);
const auth = 'Basic ' + Buffer.from(decodeURIComponent(proxy.username) + ':' + decodeURIComponent(proxy.password)).toString('base64');

// 1. 测试 HTTP (GET 方法转发)
function testHttp() {
    console.log('\n--- Testing HTTP Target ---');
    const options = {
        hostname: proxy.hostname,
        port: proxy.port,
        path: targetUrlHttp,
        method: 'GET',
        headers: {
            'Proxy-Authorization': auth,
            'Host': 'ipv4.webshare.io'
        }
    };

    const req = http.request(options, (res) => {
        console.log(`HTTP Status: ${res.statusCode}`);
        res.on('data', (d) => process.stdout.write(d));
        res.on('end', () => console.log('\nHTTP Body End'));
    });

    req.on('error', (e) => {
        console.error(`HTTP Error: ${e.message}`);
    });

    req.end();
}

// 2. 测试 HTTPS (CONNECT 方法隧道)
function testHttps() {
    console.log('\n--- Testing HTTPS Target (CONNECT) ---');

    // CONNECT 请求
    const req = http.request({
        method: 'CONNECT',
        hostname: proxy.hostname,
        port: proxy.port,
        path: 'qyapi.weixin.qq.com:443',
        headers: {
            'Proxy-Authorization': auth,
            'Host': 'qyapi.weixin.qq.com:443'
        }
    });

    req.on('connect', (res, socket, head) => {
        console.log(`CONNECT Status: ${res.statusCode} ${res.statusMessage}`);
        if (res.statusCode === 200) {
            console.log('Tunnel established successfully!');
            // 在隧道内发起 HTTPS 请求
            const httpsReq = https.request({
                hostname: 'qyapi.weixin.qq.com',
                path: '/cgi-bin/gettoken',
                method: 'GET',
                socket: socket,
                agent: false
            }, (res) => {
                console.log(`HTTPS Response Status: ${res.statusCode}`);
                // 只要有响应，哪怕是 400 提示缺少参数，也说明握手成功
                res.on('data', d => console.log('HTTPS Body chunk received'));
            });

            httpsReq.on('error', e => console.error('HTTPS Request Error:', e));
            httpsReq.end();
        } else {
            console.error('Tunnel failed');
        }
    });

    req.on('error', (e) => {
        console.error(`CONNECT Error: ${e.message}`);
    });

    req.end();
}

testHttp();
setTimeout(testHttps, 2000);
