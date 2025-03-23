import withPWA from 'next-pwa';

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
};

export default withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  swSrc: 'public/sw.js',
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