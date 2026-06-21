import { sendNodeResponse } from "../server/word-ssr-http.mjs";
import { handleBlockedWordApiRequest } from "../server/word-ssr-handler.mjs";

export default async function handler(req: any, res: any) {
  const response = await handleBlockedWordApiRequest(req);
  sendNodeResponse(res, response, String(req?.method ?? "GET").toUpperCase());
}
