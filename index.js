// index.js – full working, nothing removed, UI added to enter details
const express = require("express");
const fs = require("fs");
const path = require("path");
const login = require("ws3-fca");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let api = null;
let groupID = "";
let lockedName = "";
let appState = null;
let botRunning = false;

// Serve UI
app.get("/", (req, res) => {
  res.send(`<!doctype html>
<html lang="hi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Group Locker Bot</title>
<style>
body {
  background: url('https://wallpaperaccess.com/full/5651983.jpg') center/cover no-repeat fixed;
  font-family: 'Poppins', sans-serif;
  color: #fff;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  flex-direction: column;
}
.container {
  background: rgba(0,0,0,0.7);
  padding: 30px;
  border-radius: 20px;
  text-align: center;
  width: 90%;
  max-width: 500px;
  box-shadow: 0 0 20px #00ffcc;
}
h1 {
  color: #00ffcc;
  text-shadow: 0 0 20px #00ffcc;
}
input, textarea {
  width: 90%;
  margin: 10px 0;
  padding: 10px;
  border-radius: 10px;
  border: none;
  outline: none;
}
button {
  background: #00ffcc;
  color: #000;
  border: none;
  padding: 10px 20px;
  border-radius: 10px;
  cursor: pointer;
  font-weight: bold;
  transition: 0.3s;
}
button:hover {
  background: #00ffaa;
}
.log-box {
  margin-top: 15px;
  background: rgba(255,255,255,0.1);
  border-radius: 10px;
  padding: 10px;
  height: 200px;
  overflow-y: auto;
  text-align: left;
  font-family: monospace;
  font-size: 13px;
}
</style>
</head>
<body>
<div class="container">
  <h1>Group Name Locker Bot</h1>
  <p>Fill below details to start the bot 👇</p>
  <textarea id="appstate" placeholder='Paste appstate.json content here' rows="5"></textarea><br>
  <input type="text" id="groupID" placeholder="Enter Group Thread ID" /><br>
  <input type="text" id="lockedName" placeholder="Enter Locked Group Name" /><br>
  <button onclick="startBot()">🚀 Start Bot</button>
  <div class="log-box" id="logs">[System] Waiting for input...</div>
</div>
<script>
async function startBot() {
  const appstate = document.getElementById('appstate').value.trim();
  const groupID = document.getElementById('groupID').value.trim();
  const lockedName = document.getElementById('lockedName').value.trim();
  const logs = document.getElementById('logs');

  if(!appstate || !groupID || !lockedName) {
    logs.innerHTML += "\\n❌ Please fill all fields!";
    return;
  }

  logs.innerHTML += "\\n⚙️ Starting bot...";
  const res = await fetch('/start', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ appstate, groupID, lockedName })
  });
  const data = await res.json();
  logs.innerHTML += "\\n" + data.message;
}
</script>
</body>
</html>`);
});

// API endpoint to start bot
app.post("/start", (req, res) => {
  try {
    appState = JSON.parse(req.body.appstate);
    groupID = req.body.groupID;
    lockedName = req.body.lockedName;

    fs.writeFileSync("appstate.json", JSON.stringify(appState, null, 2));

    if (botRunning) return res.json({ message: "⚠️ Bot already running!" });

    login({ appState }, (err, apiInstance) => {
      if (err) {
        console.error("❌ Login failed:", err);
        return res.json({ message: "❌ Login failed: " + err.message });
      }
      api = apiInstance;
      botRunning = true;
      console.log("✅ Logged in successfully!");
      res.json({ message: "✅ Bot started and logged in successfully!" });
      startGroupNameLocker(api);
    });
  } catch (e) {
    console.error("Error:", e);
    res.json({ message: "❌ Invalid appstate.json format!" });
  }
});

function startGroupNameLocker(api) {
  console.log("🔒 Group Name Locker activated for ID:", groupID);
  const loop = () => {
    api.getThreadInfo(groupID, (err, info) => {
      if (err) return console.log("❌ Error fetching group info:", err.message);
      if (info.name !== lockedName) {
        console.log(\`⚠️ Group name changed to "\${info.name}" → resetting...\`);
        api.setTitle(lockedName, groupID, (err) => {
          if (err) console.log("❌ Failed to reset group name:", err.message);
          else console.log("✅ Group name reset successfully!");
        });
      } else {
        console.log("✅ Group name is correct!");
      }
      setTimeout(loop, 2000);
    });
  };
  loop();
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`🌐 Server running at http://localhost:\${PORT}\`);
});
