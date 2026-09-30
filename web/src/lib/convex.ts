import { ConvexReactClient } from 'convex/react';

/** The one Convex client. VITE_CONVEX_URL comes from .env.local in dev
 *  (written by `npx convex dev`) and from the build env in production. */
const url = import.meta.env.VITE_CONVEX_URL as string | undefined;
if (!url) throw new Error('VITE_CONVEX_URL is not set. Run `npx convex dev` in web/.');

export const convex = new ConvexReactClient(url);
