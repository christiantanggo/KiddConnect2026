#!/usr/bin/env node
// scripts/link-vapi-phone-to-assistant.js
// Link a business's VAPI phone number to its VAPI assistant (fixes "not linked" from diagnose-vapi-connection).
// Usage: node scripts/link-vapi-phone-to-assistant.js [business name]
//   If no name given, finds and fixes any business whose phone is in VAPI but not linked to its assistant.

import dotenv from "dotenv";
dotenv.config();

import { getVapiClient } from "../services/vapi.js";
import { linkAssistantToNumber } from "../services/vapi.js";
import { supabaseClient } from "../config/database.js";

async function main() {
  const businessNameArg = process.argv[2] ? process.argv[2].trim() : null;

  if (!process.env.VAPI_API_KEY) {
    console.error("❌ VAPI_API_KEY not set.");
    process.exit(1);
  }

  const { data: businesses } = await supabaseClient
    .from("businesses")
    .select("id, name, vapi_assistant_id, vapi_phone_number")
    .not("vapi_assistant_id", "is", null)
    .not("vapi_phone_number", "is", null);

  let toFix = businesses || [];
  if (businessNameArg) {
    toFix = toFix.filter((b) => b.name && b.name.toLowerCase().includes(businessNameArg.toLowerCase()));
    if (toFix.length === 0) {
      console.error('❌ No business found matching "' + businessNameArg + '"');
      process.exit(1);
    }
  }

  const vapiClient = getVapiClient();
  const phoneRes = await vapiClient.get("/phone-number");
  const phoneList = Array.isArray(phoneRes.data) ? phoneRes.data : phoneRes.data?.data || [];
  const normalize = (p) => (p || "").replace(/\D/g, "");

  for (const biz of toFix) {
    const pnNorm = normalize(biz.vapi_phone_number);
    const vapiPhone = phoneList.find((pn) => {
      const n = pn.number || pn.phoneNumber || pn.phone_number;
      return n && normalize(n) === pnNorm;
    });
    if (!vapiPhone) {
      console.log("⚠️  " + biz.name + ": phone " + biz.vapi_phone_number + " not found in VAPI, skipping.");
      continue;
    }
    const phoneNumberId = vapiPhone.id;
    const linkedId = vapiPhone.assistantId || vapiPhone.assistant?.id;
    if (linkedId === biz.vapi_assistant_id) {
      console.log("✅ " + biz.name + ": already linked.");
      continue;
    }
    console.log("Linking " + biz.name + " phone to assistant " + biz.vapi_assistant_id + "...");
    await linkAssistantToNumber(biz.vapi_assistant_id, phoneNumberId);
    console.log("✅ " + biz.name + ": linked.");
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
