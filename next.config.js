// eslint-disable-next-line @typescript-eslint/no-var-requires
const withPWA = require('next-pwa');

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
};

module.exports = withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  exclude: [
    'app-build-manifest.json',
    'build-manifest.json',
    '_buildManifest.js',
    'middleware-build-manifest.js',
    'middleware-manifest.js',
    '**/*.map',
    'react-loadable-manifest.json'
  ]
})(nextConfig); 