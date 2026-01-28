import { setupDevPlatform } from '@cloudflare/next-on-pages/next-dev';

// Here we use the @cloudflare/next-on-pages next-dev module to allow us to use bindings during local development
// (when running the application with `next dev`), for more information see:
// https://github.com/cloudflare/next-on-pages/blob/main/internal-packages/next-dev/README.md

async function setupPlatform() {
  if (process.env.NODE_ENV === 'development') {
    await setupDevPlatform();
  }
}

setupPlatform();

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // URL 重写：支持 /WW_verify_xxx.txt 格式（企业微信域名验证）
  async rewrites() {
    return [
      {
        source: '/WW_verify_:filename.txt',
        destination: '/WW_verify_:filename',
      },
    ];
  },
  webpack: (config, { isServer }) => {
    // cloudflare:sockets 是 Cloudflare Workers 运行时模块，构建时需要标记为外部依赖
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        'cloudflare:sockets': 'cloudflare:sockets',
      });
    }
    return config;
  },
};

export default nextConfig;

