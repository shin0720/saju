const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createBasicReading, createDetailedReading } = require("./saju");

const PORT = process.env.PORT || 3000;
const PAYPAL_EMAIL = "sinmihyeon@gmail.com";
const PRICE_USD = "9.90";
const PAYPAL_HOST = "ipnpb.paypal.com";
const PAYPAL_VERIFY_PATH = "/cgi-bin/webscr";

const sessions = new Map();

function sendJson(res, statusCode, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) return sendJson(res, 500, { error: "Failed to load file." });
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(data);
  });
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function verifyPaypalIPN(rawBody) {
  return new Promise((resolve, reject) => {
    const payload = `cmd=_notify-validate&${rawBody}`;
    const options = {
      hostname: PAYPAL_HOST,
      path: PAYPAL_VERIFY_PATH,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(payload)
      }
    };

    const request = https.request(options, (response) => {
      let body = "";
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        resolve(body.trim() === "VERIFIED");
      });
    });

    request.on("error", reject);
    request.write(payload);
    request.end();
  });
}

function isValidDateStr(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || "")) return false;
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && (dt.getUTCMonth() + 1) === m && dt.getUTCDate() === d;
}

function isValidTimeStr(timeStr) {
  return timeStr === "unknown" || /^\d{2}:\d{2}$/.test(timeStr || "");
}

function buildBaseUrl(req) {
  const host = req.headers.host || `localhost:${PORT}`;
  return `http://${host}`;
}

function createCheckoutUrl(req, sessionId) {
  const baseUrl = buildBaseUrl(req);
  const returnUrl = `${baseUrl}/?paid=1&session=${encodeURIComponent(sessionId)}`;
  const cancelUrl = `${baseUrl}/?canceled=1`;
  const notifyUrl = `${baseUrl}/api/paypal/ipn`;

  const qs = new URLSearchParams({
    cmd: "_xclick",
    business: PAYPAL_EMAIL,
    item_name: "Korean Saju Full Reading",
    amount: PRICE_USD,
    currency_code: "USD",
    no_note: "1",
    custom: sessionId,
    notify_url: notifyUrl,
    return: returnUrl,
    cancel_return: cancelUrl
  });
  return `https://www.paypal.com/cgi-bin/webscr?${qs.toString()}`;
}

function cleanupSessions() {
  const now = Date.now();
  for (const [id, s] of sessions.entries()) {
    if (now - s.createdAt > 1000 * 60 * 60 * 24) sessions.delete(id);
  }
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;
  cleanupSessions();

  if (req.method === "GET" && pathname === "/") {
    return sendFile(res, path.join(__dirname, "index.html"));
  }

  if (req.method === "GET" && pathname === "/api/saju/basic") {
    const birthDate = parsedUrl.searchParams.get("birthDate") || "";
    if (!isValidDateStr(birthDate)) {
      return sendJson(res, 400, { error: "Invalid birth date format. Use YYYY-MM-DD." });
    }
    const result = createBasicReading(birthDate);
    if (!result) return sendJson(res, 400, { error: "Failed to calculate free reading." });
    return sendJson(res, 200, result);
  }

  if (req.method === "GET" && pathname === "/api/paypal/checkout-url") {
    const birthDate = parsedUrl.searchParams.get("birthDate") || "";
    const birthTime = parsedUrl.searchParams.get("birthTime") || "unknown";
    const gender = parsedUrl.searchParams.get("gender") || "unknown";

    if (!isValidDateStr(birthDate)) {
      return sendJson(res, 400, { error: "Invalid birth date format." });
    }
    if (!isValidTimeStr(birthTime)) {
      return sendJson(res, 400, { error: "Invalid birth time format. Use HH:mm or unknown." });
    }

    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, {
      birthDate,
      birthTime,
      gender,
      paid: false,
      tx: "",
      createdAt: Date.now()
    });

    return sendJson(res, 200, { checkoutUrl: createCheckoutUrl(req, sessionId), sessionId });
  }

  if (req.method === "GET" && pathname === "/api/payment/verify") {
    const session = parsedUrl.searchParams.get("session") || "";
    const tx = parsedUrl.searchParams.get("tx") || "";
    const st = (parsedUrl.searchParams.get("st") || "").toLowerCase();
    const found = sessions.get(session);
    if (!found) return sendJson(res, 404, { error: "Session not found." });

    // Fallback path for return URL. Production should trust IPN/Webhook as source of truth.
    if (st.includes("completed") && tx) {
      found.paid = true;
      found.tx = tx;
      sessions.set(session, found);
      return sendJson(res, 200, { ok: true, paid: true, source: "return" });
    }
    return sendJson(res, 200, { ok: true, paid: found.paid, source: found.paid ? "ipn" : "none" });
  }

  if (req.method === "GET" && pathname === "/api/saju/detail") {
    const session = parsedUrl.searchParams.get("session") || "";
    const found = sessions.get(session);
    if (!found) return sendJson(res, 404, { error: "Session not found." });
    if (!found.paid) return sendJson(res, 402, { error: "Payment required before viewing the full reading." });

    const result = createDetailedReading(found.birthDate, found.birthTime, found.gender);
    if (!result) return sendJson(res, 400, { error: "Failed to calculate full reading." });
    return sendJson(res, 200, result);
  }

  if (req.method === "POST" && pathname === "/api/paypal/ipn") {
    try {
      const rawBody = await collectBody(req);
      const verified = await verifyPaypalIPN(rawBody);
      if (!verified) return sendText(res, 400, "INVALID");

      const params = new URLSearchParams(rawBody);
      const sessionId = params.get("custom") || "";
      const paymentStatus = (params.get("payment_status") || "").toLowerCase();
      const receiverEmail = (params.get("receiver_email") || "").toLowerCase();
      const mcGross = params.get("mc_gross") || "";
      const mcCurrency = (params.get("mc_currency") || "").toUpperCase();
      const txnId = params.get("txn_id") || "";

      const found = sessions.get(sessionId);
      if (!found) return sendText(res, 404, "UNKNOWN_SESSION");

      const expectedAmount = Number(PRICE_USD).toFixed(2);
      const receivedAmount = Number(mcGross || 0).toFixed(2);
      const amountOk = expectedAmount === receivedAmount;
      const currencyOk = mcCurrency === "USD";
      const receiverOk = receiverEmail === PAYPAL_EMAIL.toLowerCase();
      const statusOk = paymentStatus === "completed";

      if (amountOk && currencyOk && receiverOk && statusOk) {
        found.paid = true;
        found.tx = txnId;
        sessions.set(sessionId, found);
        return sendText(res, 200, "OK");
      }
      return sendText(res, 400, "MISMATCH");
    } catch (err) {
      return sendText(res, 500, "IPN_ERROR");
    }
  }

  return sendJson(res, 404, { error: "Not Found" });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
