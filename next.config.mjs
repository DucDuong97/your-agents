import withPWA from 'next-pwa';
import runtimeCaching from 'next-pwa/cache.js';

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
};

export default withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching,
  buildExcludes: [
    // Default exclusions
    'app-build-manifest.json',
    'build-manifest.json',
    '_buildManifest.js',
    'middleware-build-manifest.js',
    'middleware-manifest.js',
    '**/*.map',
    'react-loadable-manifest.json',
    // App Router specific exclusions
    '**/*_client-reference-manifest*',
    'server/**/*',
    '_next/server/**/*'
  ] 
})(nextConfig); 