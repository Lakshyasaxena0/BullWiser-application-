// Writes capacitor.config.json from ../app-config.json so there is ONE place to set the server URL.
const fs = require("fs"), path = require("path");
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "app-config.json"), "utf8"));
const out = {
  appId: cfg.appId,
  appName: cfg.appName,
  webDir: "www",
  server: { url: cfg.appUrl, cleartext: false, errorPath: "offline.html", allowNavigation: [new URL(cfg.appUrl).host, "checkout.razorpay.com", "api.razorpay.com", "*.razorpay.com"] },
  android: { allowMixedContent: false, backgroundColor: "#0f172a" },
};
fs.writeFileSync(path.join(__dirname, "..", "capacitor.config.json"), JSON.stringify(out, null, 2));
console.log("capacitor.config.json written for", cfg.appUrl);
