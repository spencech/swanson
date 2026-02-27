"use strict";const a=require("electron"),b=require("path"),q=require("url"),V=require("http"),R=require("crypto"),H=require("electron-store"),x=require("ws");var A=typeof document<"u"?document.currentScript:null;const v=new H({name:"swanson-config",encryptionKey:"swanson-secure-storage-key",defaults:{auth:{},settings:{theme:"light"},server:{url:"http://localhost:18790",token:"swanson-dev-token"},threadsCache:[],plansCache:[]}});function K(){return v.get("auth")}function G(t){v.set("auth",t)}function Y(){v.set("auth",{})}function z(){return v.get("settings")}function Q(t,e){v.set(`settings.${t}`,e)}function X(t){return v.get(`settings.${t}`)}function I(){return v.get("server",{url:"http://localhost:18790",token:"swanson-dev-token"})}function Z(t){const e=I();v.set("server",{...e,...t})}const M=4200,ee="/sso/index.html",te="776631454856-nbpd33ph7gpeeve0p1m80ibi2s5bmlj7.apps.googleusercontent.com",ne="https://dev.api.reports.teachupbeat.net/auth/google/callback";function se(){const t=R.randomUUID().replace(/-/g,""),e=Buffer.from(JSON.stringify({nonce:t,redirect:`http://localhost:${M}`,timestamp:Date.now()})).toString("base64");return`https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({client_id:te,redirect_uri:ne,response_type:"code",scope:"email openid profile",access_type:"offline",prompt:"select_account",state:e}).toString()}`}let y=null;function N(t){var e;try{const n=t.split(".");if(n.length!==3)return null;let o=n[1].replace(/-/g,"+").replace(/_/g,"/");for(;o.length%4;)o+="=";const s=Buffer.from(o,"base64").toString("utf-8"),r=JSON.parse(s);let c=r.email||((e=r["cognito:username"])!=null&&e.includes("@")?r["cognito:username"]:null)||r.preferred_username;return c&&(c=c.replace(/^google_/,"")),{email:c,name:r.given_name&&r.family_name?`${r.given_name} ${r.family_name}`:r.given_name||r.nickname||r.name||null,sub:r.sub}}catch(n){return console.error("Failed to decode JWT:",n),null}}function oe(){return new Promise((t,e)=>{y&&y.close(),y=V.createServer((n,o)=>{const s=new q.URL(n.url||"",`http://localhost:${M}`);if(s.pathname===ee||s.pathname==="/sso/"||s.pathname==="/"){const r=s.searchParams.get("id_token"),c=s.searchParams.get("access_token")||s.searchParams.get("token")||r,i=s.searchParams.get("refresh_token")||s.searchParams.get("refresh");let l=s.searchParams.get("email")||s.searchParams.get("user_email"),T=s.searchParams.get("name")||s.searchParams.get("user_name")||s.searchParams.get("display_name");if(!l){if(r){const d=N(r);d&&(l=d.email||null,T=T||d.name||null)}if(!l&&c&&c!==r){const d=N(c);d&&(l=d.email||null,T=T||d.name||null)}}if(c){const d={accessToken:c,refreshToken:i||void 0,user:l?{email:l,name:T||l}:void 0};G({accessToken:d.accessToken,refreshToken:d.refreshToken,user:d.user}),o.writeHead(200,{"Content-Type":"text/html; charset=utf-8"}),o.end(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Authentication Successful</title>
<style>
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  margin: 0;
  background: #f9fafb;
}
.container {
  text-align: center;
  padding: 2rem;
}
.success {
  color: #059669;
  font-size: 1.5rem;
  margin-bottom: 1rem;
}
.message {
  color: #6b7280;
}
</style>
</head>
<body>
<div class="container">
  <div class="success">&#10003; Authentication Successful</div>
  <p class="message">You can close this window and return to Swanson.</p>
</div>
<script>
setTimeout(function() { window.close(); }, 2000);
<\/script>
</body>
</html>`),C(),t(d)}else o.writeHead(200,{"Content-Type":"text/html; charset=utf-8"}),o.end(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Processing Authentication...</title>
</head>
<body>
<p>Processing authentication...</p>
<script>
if (window.location.hash) {
  var hash = window.location.hash.substring(1);
  window.location.href = window.location.pathname + '?' + hash;
} else {
  document.body.innerHTML = '<p>Authentication failed. Please try again.</p>';
}
<\/script>
</body>
</html>`)}else o.writeHead(404),o.end("Not Found")}),y.on("error",n=>{n.code!=="EPIPE"&&e(n)}),y.listen(M,"127.0.0.1"),setTimeout(()=>{y&&(C(),e(new Error("Authentication timed out")))},5*60*1e3)})}function C(){y&&(y.close(),y=null)}async function re(t){const e=oe(),n=se();await a.shell.openExternal(n);const o=await e;return t.webContents.send("auth-success",o),o}function ae(){Y(),C()}function W(){const t=K();return{isAuthenticated:!!(t!=null&&t.accessToken),user:t==null?void 0:t.user}}let S=null,g="disconnected",u=null,E=null,_=0,k=null,w=!1,m=null,h="";const D=10,ce=1e3,P=new Map;let U="main";function ie(){if(!S)return null;try{const t=new URL(S.serverUrl);return t.protocol=t.protocol==="https:"?"wss:":"ws:",t.pathname="/ws",t.toString()}catch{return null}}function O(t){u&&u.readyState===x.OPEN&&u.send(JSON.stringify(t))}function p(t,e){if(!k||k.isDestroyed())return;const n={type:t,sessionId:U,payload:e,timestamp:new Date().toISOString()};k.webContents.send("openclaw-message",n)}function le(t){let e;try{e=JSON.parse(t.toString())}catch{return}const n=e.type;if(n==="res"&&typeof e.id=="string"){const o=P.get(e.id);if(o){clearTimeout(o.timer),P.delete(e.id),e.ok?o.resolve(e.payload):o.reject(new Error(JSON.stringify(e.error||"Unknown error")));return}if(e.id===m&&e.ok){const s=e.payload;if((s==null?void 0:s.status)==="ok"&&w){const r=s.result,c=r==null?void 0:r.payloads;if(c!=null&&c.length){const i=c.map(l=>l.text||"").join(`
`);i&&!h&&(h=i)}p("chat",{content:h,delta:!1,done:!0,messageId:m}),w=!1,m=null,h=""}}return}if(n==="event"){const o=e.event,s=e.payload;if(o==="connect.challenge"){B();return}if(o==="agent"&&s){ue(s);return}if(o==="session.start"||o==="session.end")return}}function B(t){S&&O({type:"req",id:R.randomUUID(),method:"connect",params:{minProtocol:3,maxProtocol:3,client:{id:"cli",version:"1.0.0",platform:process.platform,mode:"cli"},role:"operator",scopes:["operator.read","operator.write"],auth:{token:S.token}}})}function ue(t){const e=t.stream,n=t.data,o=n==null?void 0:n.delta,s=n==null?void 0:n.phase;if(e==="lifecycle"){if(s==="start")return;if(s==="end"||s==="error"){if(w&&m&&(p("chat",{content:h,delta:!1,done:!0,messageId:m}),w=!1,m=null,h=""),s==="error"){const r=(n==null?void 0:n.error)||"Agent run failed";p("error",{code:"AGENT_ERROR",message:r})}return}}if(e==="assistant"&&o&&m){h+=o,p("chat",{content:o,delta:!0,done:!1,messageId:m});return}}function de(t,e,n){S={serverUrl:t,token:e,userEmail:n},U=`swanson-${n.replace(/[^a-zA-Z0-9]/g,"-")}`}async function J(){if(!S)return{success:!1,error:"Client not configured. Set server URL and token first."};const t=ie();return t?(u&&(u.removeAllListeners(),u.close(),u=null),new Promise(e=>{const n=new x(t);let o=!1,s=null;const r=c=>{let i;try{i=JSON.parse(c.toString())}catch{return}if(i.type==="event"&&i.event==="connect.challenge"){B(i.payload);return}if(i.type==="res"&&i.ok===!0){const l=i.payload;if((l==null?void 0:l.type)==="hello-ok"){o=!0,g="connected",_=0,s&&clearTimeout(s),n.removeListener("message",r),n.on("message",le),e({success:!0});return}}if(i.type==="res"&&i.ok===!1){s&&clearTimeout(s),n.close(),u=null,g="disconnected";const l=JSON.stringify(i.error||"Authentication failed");e({success:!1,error:l})}};n.on("message",r),n.on("open",()=>{u=n}),n.on("close",()=>{o&&(g="disconnected",p("status",{state:"disconnected",message:"Connection closed"}),k&&L())}),n.on("error",c=>{o?p("error",{code:"WS_ERROR",message:c.message}):(s&&clearTimeout(s),g="disconnected",e({success:!1,error:`WebSocket error: ${c.message}`}))}),s=setTimeout(()=>{o||(n.close(),u=null,g="disconnected",e({success:!1,error:"Connection handshake timed out"}))},1e4)})):{success:!1,error:"Invalid server URL"}}function j(){u&&(u.removeAllListeners(),u.close(),u=null),E&&(clearTimeout(E),E=null),g="disconnected",_=0,w=!1,m=null,h="";for(const[t,e]of P)clearTimeout(e.timer),e.reject(new Error("Disconnected"));P.clear()}function fe(){return g}function L(){if(_>=D){g="disconnected",p("status",{state:"disconnected",message:"Max reconnection attempts reached"});return}g="reconnecting";const t=Math.min(ce*Math.pow(2,_),3e4);_++,p("status",{state:"reconnecting",message:`Reconnecting in ${Math.round(t/1e3)}s (attempt ${_}/${D})`}),E=setTimeout(async()=>{(await J()).success?p("status",{state:"connected",message:"Reconnected"}):L()},t)}async function me(t,e,n){if(k=t,!S||g!=="connected"){p("error",{code:"NOT_CONNECTED",message:"Not connected to OpenClaw server"});return}const o=R.randomUUID();m=o,h="",w=!0,p("chat",{content:"",delta:!1,done:!1,messageId:o});try{const s=R.randomUUID();O({type:"req",id:o,method:"agent",params:{sessionKey:n||U,message:e,idempotencyKey:s}})}catch(s){p("error",{code:"REQUEST_ERROR",message:s.message}),w=!1,m=null,h="",L()}}function pe(){w&&(O({type:"req",id:R.randomUUID(),method:"agent.stop",params:{sessionKey:U}}),w=!1,m=null,h="")}function he(){return w}const ge=q.fileURLToPath(typeof document>"u"?require("url").pathToFileURL(__filename).href:A&&A.tagName.toUpperCase()==="SCRIPT"&&A.src||new URL("main.js",document.baseURI).href),$=b.dirname(ge);let f=null;function F(){f=new a.BrowserWindow({width:1200,height:800,minWidth:800,minHeight:600,titleBarStyle:"hiddenInset",trafficLightPosition:{x:15,y:15},webPreferences:{preload:b.join($,"preload.js"),contextIsolation:!0,nodeIntegration:!1}}),process.env.VITE_DEV_SERVER_URL?(f.loadURL(process.env.VITE_DEV_SERVER_URL),f.webContents.openDevTools()):f.loadFile(b.join($,"../dist/index.html")),f.on("closed",()=>{f=null})}a.app.whenReady().then(F);a.app.on("window-all-closed",()=>{process.platform!=="darwin"&&a.app.quit()});a.app.on("activate",()=>{a.BrowserWindow.getAllWindows().length===0&&F()});a.ipcMain.handle("get-app-version",()=>a.app.getVersion());a.ipcMain.handle("auth:login",async()=>{if(!f)throw new Error("No main window");try{return{success:!0,user:(await re(f)).user}}catch(t){return{success:!1,error:t.message}}});a.ipcMain.handle("auth:logout",()=>(ae(),{success:!0}));a.ipcMain.handle("auth:get-state",()=>W());a.ipcMain.handle("settings:get",(t,e)=>e?X(e):z());a.ipcMain.handle("settings:set",(t,e,n)=>(Q(e,n),{success:!0}));a.ipcMain.handle("openclaw:connect",async()=>{var s;const t=I(),e=W(),n=((s=e==null?void 0:e.user)==null?void 0:s.email)||"unknown";de(t.url,t.token,n);const o=await J();return o.success&&f&&f.webContents.send("openclaw-message",{type:"status",sessionId:"",payload:{state:"connected",message:"Connected to OpenClaw server"},timestamp:new Date().toISOString()}),o});a.ipcMain.handle("openclaw:send",async(t,e,n)=>{if(!f)throw new Error("No main window");return await me(f,e,n),{success:!0}});a.ipcMain.handle("openclaw:stop",()=>(pe(),{success:!0}));a.ipcMain.handle("openclaw:disconnect",()=>(j(),{success:!0}));a.ipcMain.handle("openclaw:status",()=>({state:fe()}));a.ipcMain.handle("openclaw:is-active",()=>he());a.ipcMain.handle("openclaw:set-server",(t,e,n)=>(Z({url:e,token:n}),{success:!0}));a.ipcMain.handle("openclaw:get-server",()=>I());a.app.on("before-quit",()=>{C(),j()});
