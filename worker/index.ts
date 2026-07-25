/** Cloudflare Worker entry point. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

// Durable Object classes have to be exported from the worker entry module for
// the runtime to find them.
export { RoomSession } from "../durable-objects/room-session";

/** Live gameplay socket: /api/rooms/:code/live */
const LIVE_SOCKET_PATH = /^\/api\/rooms\/([A-Za-z2-9]{6})\/live$/;

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  ROOM_SESSION: DurableObjectNamespace;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Moment-to-moment gameplay runs over a socket held by the room's Durable
    // Object. Everything else still falls through to the App Router below.
    const live = url.pathname.match(LIVE_SOCKET_PATH);
    if (live) {
      const code = live[1].toUpperCase();
      const room = env.ROOM_SESSION.get(env.ROOM_SESSION.idFromName(code));
      return room.fetch(request);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
