import type { MetadataRoute } from "next";

/** Manifeste : WacMan s'installe comme une application sur mobile et sur ordinateur. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WacMan : Wifirst Account Management",
    short_name: "WacMan",
    description: "Pilotage des comptes clients de Wifirst",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#031820",
    theme_color: "#031820",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
