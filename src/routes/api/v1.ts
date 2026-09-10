import { createFileRoute } from "@tanstack/react-router";
import { authenticateApiRequest, apiFailure, apiResponse } from "@/lib/commercial-api.server";
export const Route=createFileRoute("/api/v1")({server:{handlers:{GET:async({request})=>{try{const ctx=await authenticateApiRequest(request); return apiResponse(ctx,{service:"stream-monitor-api",version:"v1",documentation:"https://streammonitor.site/developers"});}catch(error){return apiFailure(error);}}}}});
