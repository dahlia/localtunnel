import { openTunnel } from "@hongminhee/localtunnel";
import process from "node:process";

console.log("🚀 Testing localtunnel...");
console.log("Attempting to create tunnel for port 8000...");

try {
  const tunnel = await openTunnel({ port: 8000, service: "pinggy.io" });

  console.log(`✅ Tunnel created successfully!`);
  console.log(`📡 Local port: ${tunnel.localPort}`);
  console.log(`🌐 Public URL: ${tunnel.url.href}`);
  console.log(`🔧 Process ID: ${tunnel.pid}`);

  console.log("\n⏳ Tunnel will stay open for 10 seconds...");
  console.log(
    "You can test the tunnel by visiting the public URL in your browser.",
  );

  // Keep tunnel open for 10 seconds
  await new Promise((resolve) => setTimeout(resolve, 10000));

  console.log("\n🔒 Closing tunnel...");
  await tunnel.close();
  console.log("✅ Tunnel closed successfully!");
} catch (error) {
  console.error("❌ Error creating tunnel:", String(error));
  process.exit(1);
}
