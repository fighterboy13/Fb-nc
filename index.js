const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const login = require("fca-unofficial");
const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
const upload = multer({ dest: "uploads/" });

let api = null, botRunning = false, groupID = "", lockedName = "", appState = null;

// auto-load appstate.json if exists
try {
  if (fs.existsSync("appstate.json")) {
    appState = JSON.parse(fs.readFileSync("appstate.json", "utf8"));
    console.log("appstate.json found, auto-login will be attempted.");
  }
} catch (e) {
  console.log("Error loading appstate.json:", e.message);
}

if (appState) attemptAutoLogin();

// UI page
app.get("/", (_, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Group Locker Bot</title>
<style>
body{
  margin:0;height:100vh;
  display:flex;align-items:center;justify-content:center;
  background:linear-gradient(135deg,#0f1724,#1b2638,#0f1724);
  background-size:400% 400%;animation:bg 10s ease infinite;
  font-family:Poppins, sans-serif;color:#fff;
}
@keyframes bg{
  0%{background-position:0% 50%;}
  50%{background-position:100% 50%;}
  100%{background-position:0% 50%;}
}
.container{
  background:rgba(0,0,0,0.7);padding:30px;border-radius:16px;
  box-shadow:0 0 30px rgba(123,97,255,0.3);
  text-align:center;width:90%;max-width:520px;
}
h1{color:#7df9d8;text-shadow:0 0 15px #7df9d8;}
input,textarea{
  width:90%;padding:10px;margin:8px 0;
  border:none;border-radius:8px;background:rgba(255,255,255,0.1);color:#fff;
}
button{
  padding:10px 20px;margin:6px;
  border:none;border-radius:8px;cursor:pointer;
  background:linear-gradient(90deg,#7df9d8,#7b61ff);
  color:#000;font-weight:bold;
}
.log{background:rgba(255,255,255,0.05);border-radius:10px;padding:10px;margin-top:10px;height:160px;overflow:auto;text-align:left;font-family:monospace;font-size:13px;}
</style>
</head>
<body>
<div class="container">
  <h1>YK TRICKS INDIA</h1>
  <p>Upload your <b>appstate.json</b> and enter group details below.</p>
  <input type="file" id="fileInput" accept=".json"/><br>
  <textarea id="appstateText" rows="4" placeholder="Or paste appstate.json content here"></textarea><br>
  <button onclick="uploadFile()">Upload File</button>
  <button onclick="saveText()">Save From Text</button><br>
  <input type="text" id="groupID" placeholder="Enter Group Thread ID"/><br>
  <input type="text" id="lockedName" placeholder="Enter Locked Group Name"/><br>
  <button onclick="startBot()">Start Bot</button>
  <button onclick="stopBot()">Stop Bot</button>
  <div class="log" id="logs">[System] Ready.</div>
</div>
<script>
function log(t){const e=document.getElementById('logs');e.innerText+="\\n"+t;e.scrollTop=e.scrollHeight;}
async function uploadFile(){
 const f=document.getElementById('fileInput').files[0];
 if(!f){log("Select a file first.");return;}
 const fd=new FormData();fd.append('appstate',f);
 log("Uploading appstate.json...");
 const r=await fetch('/upload',{method:'POST',body:fd});const j=await r.json();log(j.message);
}
async function saveText(){
 const t=document.getElementById('appstateText').value.trim();
 if(!t){log("No text provided.");return;}
 log("Saving appstate from pasted text...");
 const r=await fetch('/save-text',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({appstate:t})});
 const j=await r.json();log(j.message);
}
async function startBot(){
 const g=document.getElementById('groupID').value.trim();
 const l=document.getElementById('lockedName').value.trim();
 if(!g||!l){log("Please fill Group ID and Locked Name.");return;}
 log("Starting bot...");
 const r=await fetch('/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({groupID:g,lockedName:l})});
 const j=await r.json();log(j.message);
}
async function stopBot(){
 const r=await fetch('/stop',{method:'POST'});const j=await r.json();log(j.message);
}
</script>
</body>
</html>`);
});

// upload via file
app.post("/upload", upload.single("appstate"), (req, res) => {
  try {
    const tmp = req.file.path;
    fs.copyFileSync(tmp, "appstate.json");
    fs.unlinkSync(tmp);
    appState = JSON.parse(fs.readFileSync("appstate.json"));
    res.json({ message: "appstate.json uploaded and saved." });
  } catch (e) {
    res.status(500).json({ message: "Upload failed: " + e.message });
  }
});

// save pasted text
app.post("/save-text", (req, res) => {
  try {
    const raw = req.body.appstate;
    if (!raw) return res.json({ message: "No appstate content." });
    const parsed = JSON.parse(raw);
    fs.writeFileSync("appstate.json", JSON.stringify(parsed, null, 2));
    appState = parsed;
    res.json({ message: "appstate.json saved." });
  } catch (e) {
    res.status(500).json({ message: "Save failed: " + e.message });
  }
});

// start bot
app.post("/start", (req, res) => {
  if (!appState) return res.json({ message: "Upload appstate.json first." });
  if (botRunning) return res.json({ message: "Bot already running." });
  groupID = req.body.groupID; lockedName = req.body.lockedName;
  if (!groupID || !lockedName) return res.json({ message: "Group ID and Locked Name required." });
  login({ appState }, (err, apiInstance) => {
    if (err) return res.json({ message: "Login failed: " + err.message });
    api = apiInstance; botRunning = true;
    res.json({ message: "Bot started successfully." });
    runLocker(api);
  });
});

// stop bot
app.post("/stop", (_, res) => { botRunning = false; res.json({ message: "Bot stopped." }); });

// group locker loop
function runLocker(api){
  const loop = () => {
    if (!botRunning) return;
    api.getThreadInfo(groupID, (err, info) => {
      if (err) return console.log("Error:", err.message);
      if (info.name !== lockedName){
        console.log("Group name changed to", info.name, "→ resetting...");
        api.setTitle(lockedName, groupID, e=>{
          if(e) console.log("Reset failed:", e.message);
          else console.log("Group name reset successfully!");
        });
      } else console.log("Group name is correct.");
    });
    setTimeout(loop,2000);
  };
  loop();
}

// auto-login helper
function attemptAutoLogin(){
  login({ appState }, (err, apiInstance) => {
    if (err) return console.log("Auto-login failed:", err.message);
    api = apiInstance; console.log("Auto-login successful. Ready.");
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log("Server running on port", PORT));
