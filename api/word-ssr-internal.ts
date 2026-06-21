import { sendNodeResponse } from "../server/word-ssr-http.mjs";
import { handleInternalWordSsrRequest } from "../server/word-ssr-handler.mjs";

export default async function handler(req: any, res: any) {
  const response = await handleInternalWordSsrRequest(req);
  sendNodeResponse(res, response, String(req?.method ?? "GET").toUpperCase());
}
