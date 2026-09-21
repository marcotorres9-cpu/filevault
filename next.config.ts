import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  async rewrites() {
    return {
      beforeFiles: [],
      // Cualquier URL antigua con nombre de archivo (ej. /FileVault-v5.2.apk, /FileVault-v4.0.apk)
      // sirve SIEMPRE la version actual para que los codigos de Downloader sigan funcionando.
      afterFiles: [
        // Enlaces directos históricos que pudo haber guardado Downloader
        { source: "/FileVault-v4.0.apk", destination: "/apk" },
        { source: "/FileVault-v5.0.apk", destination: "/apk" },
        { source: "/FileVault-v5.1.apk", destination: "/apk" },
        { source: "/FileVault-v5.2.apk", destination: "/apk" },
        // Cualquier otro nombre .apk de raiz -> version actual
        {
          source: "/:file*.apk",
          destination: "/apk",
        },
      ],
      fallback: [],
    };
  },
};

export default nextConfig;
