import {createFileRoute,redirect} from "@tanstack/react-router";

// Retired Stream Play Android administration. Keep the old URL working as
// a harmless redirect, without exposing obsolete licensing or releases.
export const Route=createFileRoute("/_authenticated/app/admin/stream-play-versions")({
 beforeLoad:()=>{throw redirect({to:"/app/admin"});},
 component:()=>null,
});
