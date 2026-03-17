#!/usr/bin/env node
// scripts/diagnose-vapi-connection.js
// Find out what went wrong with the connection from our system to VAPI.
// Run: node scripts/diagnose-vapi-connection.js
// Requires: .env with VAPI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (for DB cross-check)

import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_BASE_URL = process.env.VAPI_BASE_URL || "https://api.vapi.ai";

function log(msg, level = "info") {
  const prefix = level === "err" ? "❌ " : level === "warn" ? "⚠️  " : "   ";
  console.log(prefix + msg);
}

function section(title) {
  console.log("\n" + "=".repeat(60));
  console.log("  " + title);
  console.log("=".repeat(60));
}

async function main() {
  console.log("\n🔍 TAVARI → VAPI CONNECTION DIAGNOSTIC");
  console.log("   Finding what went wrong between our system and VAPI.\n");

  const failures = [];
  const warnings = [];

  // ─── 1. Outbound: Can our system reach VAPI API? ─────────────────────
  section("1. OUTBOUND: Tavari → VAPI API");

  if (!VAPI_API_KEY) {
    log("VAPI_API_KEY is not set in environment.", "err");
    failures.push("VAPI_API_KEY not set - our server cannot talk to VAPI at all.");
    console.log("\n   Fix: Set VAPI_API_KEY in .env or Railway/host env.");
  } else {
    log("VAPI_API_KEY is set.");
    log("VAPI_BASE_URL: " + (VAPI_BASE_URL || "https://api.vapi.ai (default)"));

    try {
      const res = await axios.get(`${VAPI_BASE_URL}/assistant`, {
        headers: {
          Authorization: `Bearer ${VAPI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      });
      const assistants = Array.isArray(res.data) ? res.data : res.data?.data || [];
      log("VAPI API response: OK (HTTP " + res.status + ")");
      log("Assistants in VAPI: " + assistants.length);
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data;
      if (status === 401) {
        log("VAPI API returned 401 Unauthorized.", "err");
        failures.push("VAPI_API_KEY is invalid or expired. Get a new key from VAPI dashboard.");
      } else if (status === 403) {
        log("VAPI API returned 403 Forbidden.", "err");
        failures.push("VAPI_API_KEY may not have permission to access this resource.");
      } else if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
        log("Cannot reach VAPI (network/DNS): " + (err.message || err.code), "err");
        failures.push("Network or DNS issue reaching " + VAPI_BASE_URL);
      } else if (err.code === "ETIMEDOUT") {
        log("Request to VAPI timed out.", "err");
        failures.push("VAPI API timeout - check firewall/network.");
      } else {
        log("VAPI API error: " + (status ? "HTTP " + status : err.message), "err");
        if (data && typeof data === "object") log("Response: " + JSON.stringify(data).slice(0, 200));
        failures.push("VAPI API call failed: " + (data?.message || err.message));
      }
    }
  }

  // ─── 2. Our database: what do we think we have? ───────────────────────
  section("2. OUR DATA: Businesses and assistant/phone in DB");

  let businesses = [];
  try {
    const { supabaseClient } = await import("../config/database.js");
    const { data, error } = await supabaseClient
      .from("businesses")
      .select("id, name, vapi_assistant_id, vapi_phone_number, ai_enabled")
      .not("vapi_assistant_id", "is", null)
      .limit(20);
    if (error) throw error;
    businesses = data || [];
    log("Businesses with vapi_assistant_id: " + businesses.length);
    if (businesses.length === 0) {
      warnings.push("No businesses in DB have a VAPI assistant ID. Provision an assistant first.");
    } else {
      businesses.slice(0, 5).forEach((b) => {
        log(`  - ${b.name}: assistant=${(b.vapi_assistant_id || "").slice(0, 8)}... phone=${b.vapi_phone_number || "none"}`);
      });
      if (businesses.length > 5) log("  ... and " + (businesses.length - 5) + " more");
    }
  } catch (e) {
    log("Could not read businesses from DB: " + e.message, "err");
    failures.push("Database read failed - check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  // ─── 3. Cross-check: Do our assistant IDs and numbers exist in VAPI? Are numbers linked? ───
  section("3. CROSS-CHECK: DB vs VAPI (assistants + phone links)");

  if (!VAPI_API_KEY || failures.some((f) => f.includes("VAPI_API_KEY") || f.includes("401") || f.includes("Network"))) {
    log("Skipping (VAPI API not reachable).", "warn");
  } else if (businesses.length === 0) {
    log("No businesses with assistants to check.");
  } else {
    let assistantsList = [];
    let phoneNumbersList = [];
    try {
      const [aRes, pRes] = await Promise.all([
        axios.get(`${VAPI_BASE_URL}/assistant`, {
          headers: { Authorization: `Bearer ${VAPI_API_KEY}`, "Content-Type": "application/json" },
          timeout: 10000,
        }),
        axios.get(`${VAPI_BASE_URL}/phone-number`, {
          headers: { Authorization: `Bearer ${VAPI_API_KEY}`, "Content-Type": "application/json" },
          timeout: 10000,
        }),
      ]);
      assistantsList = Array.isArray(aRes.data) ? aRes.data : aRes.data?.data || [];
      phoneNumbersList = Array.isArray(pRes.data) ? pRes.data : pRes.data?.data || [];
    } catch (err) {
      log("Failed to list VAPI assistants or phone numbers: " + (err.response?.status || err.message), "err");
      failures.push("Could not list VAPI resources for cross-check.");
    }

    const vapiAssistantIds = new Set(assistantsList.map((a) => a.id));
    const normalizePhone = (p) => (p || "").replace(/\D/g, "");
    const phoneToRecord = new Map();
    phoneNumbersList.forEach((pn) => {
      const num = pn.number || pn.phoneNumber || pn.phone_number;
      if (num) phoneToRecord.set(normalizePhone(num), pn);
    });

    for (const b of businesses.slice(0, 10)) {
      const aid = b.vapi_assistant_id;
      const phone = b.vapi_phone_number;
      const assistantExists = vapiAssistantIds.has(aid);
      const pnNorm = normalizePhone(phone);
      const vapiPhone = phone ? phoneToRecord.get(pnNorm) : null;
      const linkedId = vapiPhone?.assistantId || vapiPhone?.assistant?.id;
      const isLinked = linkedId === aid;

      if (!assistantExists) {
        log(`Business "${b.name}": assistant ${aid} NOT FOUND in VAPI.`, "err");
        failures.push(`Assistant ${aid} (${b.name}) does not exist in VAPI - may have been deleted or wrong ID.`);
      } else {
        log(`Business "${b.name}": assistant exists in VAPI.`);
      }
      if (phone && !vapiPhone) {
        log(`  Phone ${phone} NOT FOUND in VAPI.`, "err");
        failures.push(`Phone ${phone} (${b.name}) is not in VAPI - not provisioned or wrong number.`);
      } else if (phone && vapiPhone) {
        if (!isLinked) {
          log(`  Phone ${phone} is in VAPI but NOT LINKED to this assistant (linked to: ${linkedId || "none"}).`, "err");
          failures.push(`Phone number for ${b.name} is not linked to its assistant in VAPI - calls will not be answered by this agent.`);
        } else {
          log(`  Phone ${phone} linked to assistant. OK.`);
        }
      }
    }
  }

  // ─── 4. Webhook: Can VAPI reach us? Config in VAPI correct? ──────────
  section("4. INBOUND: VAPI → Tavari (webhook)");

  const backendUrl =
    process.env.BACKEND_URL ||
    process.env.RAILWAY_PUBLIC_DOMAIN ||
    process.env.VERCEL_URL ||
    process.env.SERVER_URL ||
    "https://api.kiddconnect.com";
  const webhookUrl = backendUrl.startsWith("http") ? backendUrl + "/api/vapi/webhook" : "https://" + backendUrl + "/api/vapi/webhook";

  if (!process.env.BACKEND_URL && !process.env.RAILWAY_PUBLIC_DOMAIN && !process.env.VERCEL_URL && !process.env.SERVER_URL) {
    log("No webhook URL env set (BACKEND_URL, RAILWAY_PUBLIC_DOMAIN, etc.). Using default.", "warn");
    warnings.push("Set BACKEND_URL (or RAILWAY_PUBLIC_DOMAIN) so webhook URL is correct in VAPI.");
  }
  log("Expected webhook URL: " + webhookUrl);

  if (VAPI_API_KEY && businesses.length > 0) {
    try {
      const { supabaseClient } = await import("../config/database.js");
      const { data: bizList } = await supabaseClient
        .from("businesses")
        .select("id, name, vapi_assistant_id")
        .not("vapi_assistant_id", "is", null)
        .limit(5);
      const vapiClient = axios.create({
        baseURL: VAPI_BASE_URL,
        headers: { Authorization: `Bearer ${VAPI_API_KEY}`, "Content-Type": "application/json" },
        timeout: 8000,
      });
      for (const b of bizList || []) {
        const aRes = await vapiClient.get(`/assistant/${b.vapi_assistant_id}`);
        const a = aRes.data;
        const serverUrl = a.serverUrl || a.server_url;
        const match = serverUrl === webhookUrl || (serverUrl && webhookUrl && serverUrl.replace(/\/$/, "") === webhookUrl.replace(/\/$/, ""));
        if (!serverUrl) {
          log(`Assistant "${b.name}": serverUrl NOT SET in VAPI.`, "err");
          failures.push("Assistant " + b.vapi_assistant_id + " has no serverUrl - webhooks will not be sent.");
        } else if (!match) {
          log(`Assistant "${b.name}": webhook URL mismatch.`, "err");
          log(`  In VAPI:  ${serverUrl}`);
          log(`  Expected: ${webhookUrl}`);
          failures.push("Webhook URL in VAPI does not match our BACKEND_URL - events may go to wrong place or fail.");
        } else {
          log(`Assistant "${b.name}": webhook URL OK.`);
        }
        if (!a.serverMessages || a.serverMessages.length === 0) {
          log(`  serverMessages not set - VAPI may not send events.`, "warn");
          warnings.push("Assistant has no serverMessages - add status-update, end-of-call-report.");
        }
      }
    } catch (e) {
      log("Could not verify assistant webhook config: " + e.message, "err");
    }
  }

  // ─── 5. Optional: Can we reach our own webhook? ───────────────────────
  try {
    const ping = await axios.get(webhookUrl, { timeout: 8000, validateStatus: () => true });
    if (ping.status === 200) {
      log("Webhook endpoint reachable from this machine (GET " + webhookUrl + " → 200).");
    } else {
      log("Webhook returned HTTP " + ping.status + " (expected 200).", "warn");
      warnings.push("Webhook URL returned " + ping.status + " - VAPI may still accept it for POST.");
    }
  } catch (e) {
    log("Could not reach webhook from this machine: " + (e.code || e.message), "warn");
    warnings.push("From this machine the webhook URL is not reachable (e.g. if server runs elsewhere, this is OK).");
  }

  // ─── SUMMARY ─────────────────────────────────────────────────────────
  section("SUMMARY: What went wrong?");

  if (failures.length === 0 && warnings.length === 0) {
    console.log("\n   ✅ No connection issues detected.");
    console.log("   If calls still fail, check VAPI dashboard (Calls, Logs) and server logs when you place a test call.\n");
    return;
  }

  if (failures.length > 0) {
    console.log("\n   Failures (fix these first):\n");
    failures.forEach((f) => log(f, "err"));
  }
  if (warnings.length > 0) {
    console.log("\n   Warnings:\n");
    warnings.forEach((w) => log(w, "warn"));
  }

  console.log("\n   Next steps:");
  if (failures.some((f) => f.includes("VAPI_API_KEY") || f.includes("401"))) {
    console.log("   - Get a valid VAPI API key from https://dashboard.vapi.ai and set VAPI_API_KEY.");
  }
  if (failures.some((f) => f.includes("not linked") || f.includes("NOT LINKED"))) {
    console.log("   - In VAPI Dashboard: Phone Numbers → select number → set Assistant → Save. Or use your app's link/retry flow.");
  }
  if (failures.some((f) => f.includes("serverUrl") || f.includes("webhook URL"))) {
    console.log("   - Run: node scripts/fix-assistant-webhook.js (or set BACKEND_URL and rebuild assistant).");
  }
  console.log("");
}

main().catch((e) => {
  console.error("Diagnostic script failed:", e);
  process.exit(1);
});
