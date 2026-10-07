// backend/routes/chatbot.routes.js
// AI Chatbot route powered by Google Gemini API.
// Pulls live data from MySQL (phpMyAdmin) including products, stock, customer orders,
// and warranty claims to provide real-time, accurate assistance.
const express = require('express');
const https = require('https');
const dns = require('dns');
const net = require('net');
const { pool } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Supported Gemini models with automatic fallback
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const FALLBACK_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash'];

// Gemini tool definitions (Function Calling)
const GEMINI_TOOLS = [
  {
    function_declarations: [
      {
        name: 'search_products',
        description: 'ค้นหารายการสินค้าในสต็อกร้านค้า (ตาราง Inventory) ตามคำค้นหา หมวดหมู่ หรือช่วงงบประมาณ',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: { type: 'STRING', description: 'คำค้นหา เช่น ชื่อสินค้า รุ่น หรือประเภท (เช่น ลำโพง, ไมโครโฟน, บลูทูธ)' },
            category: { type: 'STRING', description: 'หมวดหมู่สินค้า' },
            maxPrice: { type: 'NUMBER', description: 'งบประมาณสูงสุด (บาท)' },
          },
        },
      },
      {
        name: 'check_product_stock',
        description: 'ตรวจสอบรายละเอียด สเปก ราคา และจำนวนสต็อกคงเหลือของสินค้าเจาะจง',
        parameters: {
          type: 'OBJECT',
          properties: {
            productName: { type: 'STRING', description: 'ชื่อหรือรุ่นของสินค้าที่ต้องการตรวจสอบ' },
          },
          required: ['productName'],
        },
      },
      {
        name: 'get_my_orders',
        description: 'ดึงข้อมูลประวัติคำสั่งซื้อล่าสุด รายการสินค้าที่สั่ง และสถานะการจัดส่งของลูกค้าที่กำลังคุยอยู่',
        parameters: {
          type: 'OBJECT',
          properties: {},
        },
      },
      {
        name: 'get_my_claims',
        description: 'ดึงข้อมูลประวัติและสถานะการส่งเคลมสินค้าของลูกค้าที่กำลังคุยอยู่',
        parameters: {
          type: 'OBJECT',
          properties: {},
        },
      },
      {
        name: 'get_shop_categories',
        description: 'ดูหมวดหมู่สินค้าทั้งหมดที่มีขายในร้าน',
        parameters: {
          type: 'OBJECT',
          properties: {},
        },
      },
    ],
  },
];

// Helper: Query products from MySQL
async function executeSearchProducts({ query, category, maxPrice }) {
  try {
    let sql = 'SELECT id, name, price, original_price, stock, category, description, model, warranty_months FROM Inventory WHERE is_active = 1';
    const params = [];

    if (category) {
      sql += ' AND category LIKE ?';
      params.push(`%${category}%`);
    }
    if (query) {
      sql += ' AND (name LIKE ? OR description LIKE ? OR model LIKE ?)';
      params.push(`%${query}%`, `%${query}%`, `%${query}%`);
    }
    if (maxPrice && !isNaN(maxPrice)) {
      sql += ' AND price <= ?';
      params.push(Number(maxPrice));
    }

    sql += ' ORDER BY id DESC LIMIT 8';
    const [rows] = await pool.query(sql, params);
    return {
      totalFound: rows.length,
      products: rows.map((r) => ({
        id: r.id,
        name: r.name,
        price: Number(r.price),
        original_price: r.original_price ? Number(r.original_price) : null,
        stock: r.stock,
        inStock: r.stock > 0,
        category: r.category,
        model: r.model || '-',
        warranty_months: r.warranty_months,
        description: r.description ? r.description.slice(0, 150) : '',
      })),
    };
  } catch (err) {
    console.error('executeSearchProducts error:', err.message);
    return { error: 'ไม่สามารถค้นหาสินค้าจากฐานข้อมูลได้ในขณะนี้: ' + err.message };
  }
}

// Helper: Check single product stock
async function executeCheckStock({ productName }) {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, price, original_price, stock, category, description, model, warranty_months 
       FROM Inventory 
       WHERE is_active = 1 AND (name LIKE ? OR model LIKE ?)
       LIMIT 4`,
      [`%${productName}%`, `%${productName}%`]
    );
    if (!rows.length) {
      return { found: false, message: `ไม่พบสินค้าที่ตรงกับชื่อ "${productName}" ในระบบ` };
    }
    return {
      found: true,
      products: rows.map((r) => ({
        id: r.id,
        name: r.name,
        price: Number(r.price),
        stock: r.stock,
        available: r.stock > 0 ? `มีสินค้าพร้อมส่ง ${r.stock} ชิ้น` : 'สินค้าหมดชั่วคราว',
        category: r.category,
        model: r.model || '-',
        warranty: `${r.warranty_months} เดือน`,
      })),
    };
  } catch (err) {
    console.error('executeCheckStock error:', err.message);
    return { error: 'เกิดข้อผิดพลาดในการตรวจสอบสต็อก: ' + err.message };
  }
}

// Helper: Get user's recent orders from MySQL
async function executeGetUserOrders(userId) {
  try {
    if (!userId) {
      return { message: 'กรุณาเข้าสู่ระบบเพื่อตรวจสอบข้อมูลคำสั่งซื้อของคุณ' };
    }

    const [orders] = await pool.query(
      `SELECT order_id, order_date, total_amount, status, payment_status, cancel_reason
       FROM Orders 
       WHERE user_id = ? 
       ORDER BY order_id DESC 
       LIMIT 5`,
      [userId]
    );

    if (!orders.length) {
      return { totalOrders: 0, message: 'คุณยังไม่มีประวัติคำสั่งซื้อในระบบ' };
    }

    const orderIds = orders.map((o) => o.order_id);
    const [items] = await pool.query(
      `SELECT od.order_id, od.product_id, od.quantity, od.price, i.name as product_name
       FROM Order_Details od
       LEFT JOIN Inventory i ON od.product_id = i.id
       WHERE od.order_id IN (?)`,
      [orderIds]
    );

    const itemsByOrder = items.reduce((acc, item) => {
      acc[item.order_id] = acc[item.order_id] || [];
      acc[item.order_id].push({
        name: item.product_name || `สินค้า #${item.product_id}`,
        quantity: item.quantity,
        price: Number(item.price),
      });
      return acc;
    }, {});

    return {
      totalOrders: orders.length,
      orders: orders.map((o) => ({
        order_id: o.order_id,
        date: o.order_date,
        total: Number(o.total_amount),
        order_status: o.status,
        payment_status: o.payment_status || 'รอตรวจสอบ',
        items: itemsByOrder[o.order_id] || [],
      })),
    };
  } catch (err) {
    console.error('executeGetUserOrders error:', err.message);
    return { error: 'ไม่สามารถดึงข้อมูลคำสั่งซื้อได้: ' + err.message };
  }
}

// Helper: Get user's claims from MySQL
async function executeGetUserClaims(userId) {
  try {
    if (!userId) {
      return { message: 'กรุณาเข้าสู่ระบบเพื่อตรวจสอบข้อมูลการเคลม' };
    }

    const [claims] = await pool.query(
      `SELECT c.claim_id, c.claim_number, c.status, c.symptom, c.created_at, pu.serial_number, i.name as product_name
       FROM Claims c
       LEFT JOIN Product_Units pu ON c.product_unit_id = pu.id
       LEFT JOIN Inventory i ON pu.product_id = i.id
       WHERE c.user_id = ?
       ORDER BY c.claim_id DESC
       LIMIT 5`,
      [userId]
    );

    if (!claims.length) {
      return { totalClaims: 0, message: 'คุณไม่มีรายการเคลมสินค้าในระบบ' };
    }

    return {
      totalClaims: claims.length,
      claims: claims.map((c) => ({
        claim_number: c.claim_number,
        product: c.product_name || 'ไม่ระบุ',
        serial: c.serial_number || '-',
        status: c.status,
        symptom: c.symptom,
        date: c.created_at,
      })),
    };
  } catch (err) {
    console.error('executeGetUserClaims error:', err.message);
    return { error: 'ไม่สามารถดึงข้อมูลการเคลมได้: ' + err.message };
  }
}

// Helper: Get categories
async function executeGetShopCategories() {
  try {
    const [rows] = await pool.query('SELECT DISTINCT category FROM Inventory WHERE is_active = 1');
    return {
      categories: rows.map((r) => r.category).filter(Boolean),
    };
  } catch (err) {
    return { error: err.message };
  }
}

// Dispatch tool function calls
async function handleToolCall(name, args, userId) {
  switch (name) {
    case 'search_products':
      return await executeSearchProducts(args || {});
    case 'check_product_stock':
      return await executeCheckStock(args || {});
    case 'get_my_orders':
      return await executeGetUserOrders(userId);
    case 'get_my_claims':
      return await executeGetUserClaims(userId);
    case 'get_shop_categories':
      return await executeGetShopCategories();
    default:
      return { error: `ไม่รู้จักฟังก์ชัน ${name}` };
  }
}

function testTcpReachability(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

// GET /api/chat/health
// Diagnostic endpoint to check Gemini API Key & network reachability
router.get('/health', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const isKeySet = Boolean(apiKey && apiKey.trim() !== '' && apiKey !== 'YOUR_GEMINI_API_KEY');

  const info = {
    status: 'ok',
    shopName: process.env.SHOP_NAME || 'hello test.t',
    apiKeyConfigured: isKeySet,
    apiKeyLength: apiKey ? apiKey.length : 0,
    model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
    serverTime: new Date().toISOString(),
  };

  try {
    const addresses = await dns.promises.resolve4('generativelanguage.googleapis.com');
    info.dns = { ok: true, ipv4: addresses };
  } catch (err) {
    info.dns = { ok: false, error: err.message, code: err.code };
  }

  // Test TCP connection to port 443
  info.canReachGoogleHttps = await testTcpReachability('generativelanguage.googleapis.com', 443, 3000);

  res.json(info);
});

// GET /api/chat/context
// Returns real-time database context (products, categories, user orders & claims)
// so the chatbot can formulate responses with 100% real phpMyAdmin data seamlessly.
router.get('/context', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const username = req.user?.username || 'ลูกค้า';
    const shopName = process.env.SHOP_NAME || 'hello test.t';

    // 1. Active Products from Inventory
    const [products] = await pool.query(
      `SELECT id, name, price, original_price, stock, category, description, model, warranty_months 
       FROM Inventory 
       WHERE is_active = 1 
       ORDER BY id DESC LIMIT 50`
    );

    // 2. Categories
    const categories = [...new Set(products.map((p) => p.category).filter(Boolean))];

    // 3. User's recent orders
    const [orders] = await pool.query(
      `SELECT order_id, order_date, total_amount, status, payment_status, cancel_reason 
       FROM Orders 
       WHERE user_id = ? 
       ORDER BY order_id DESC LIMIT 5`,
      [userId]
    );

    let orderItems = [];
    if (orders.length > 0) {
      const orderIds = orders.map((o) => o.order_id);
      const [items] = await pool.query(
        `SELECT od.order_id, od.product_id, od.quantity, od.price, i.name as product_name
         FROM Order_Details od
         LEFT JOIN Inventory i ON od.product_id = i.id
         WHERE od.order_id IN (?)`,
        [orderIds]
      );
      orderItems = items;
    }

    const itemsByOrder = orderItems.reduce((acc, item) => {
      acc[item.order_id] = acc[item.order_id] || [];
      acc[item.order_id].push({
        name: item.product_name || `สินค้า #${item.product_id}`,
        quantity: item.quantity,
        price: Number(item.price),
      });
      return acc;
    }, {});

    const formattedOrders = orders.map((o) => ({
      order_id: o.order_id,
      date: o.order_date,
      total: Number(o.total_amount),
      status: o.status,
      payment_status: o.payment_status || 'รอตรวจสอบ',
      items: itemsByOrder[o.order_id] || [],
    }));

    // 4. User's claims
    let claims = [];
    try {
      const [claimRows] = await pool.query(
        `SELECT c.claim_id, c.claim_number, c.status, c.symptom, c.created_at, pu.serial_number, i.name as product_name
         FROM Claims c
         LEFT JOIN Product_Units pu ON c.product_unit_id = pu.id
         LEFT JOIN Inventory i ON pu.product_id = i.id
         WHERE c.user_id = ?
         ORDER BY c.claim_id DESC LIMIT 5`,
        [userId]
      );
      claims = claimRows;
    } catch {
      // Non-fatal if claims table is empty
    }

    res.json({
      shopName,
      username,
      userId,
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        original_price: p.original_price ? Number(p.original_price) : null,
        stock: p.stock,
        category: p.category,
        model: p.model || '-',
        warranty_months: p.warranty_months,
      })),
      categories,
      orders: formattedOrders,
      claims: (claims || []).map((c) => ({
        claim_number: c.claim_number,
        product: c.product_name || '-',
        serial: c.serial_number || '-',
        status: c.status,
        symptom: c.symptom,
        date: c.created_at,
      })),
      apiKey: process.env.GEMINI_API_KEY || null,
      model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
    });
  } catch (err) {
    next(err);
  }
});

// Call Gemini API via Node's native HTTPS with forced IPv4 (family: 4)
// This avoids IPv6 routing timeout issues commonly encountered on university/VPS networks.
function callGeminiHttps(modelName, apiKey, payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      method: 'POST',
      family: 4, // Force IPv4
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'JeerawatShop-Chatbot/1.0',
      },
      timeout: 5000,
    };

    const req = https.request(options, (res) => {
      let rawData = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        rawData += chunk;
      });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(rawData);
        } catch (e) {
          return reject(new Error(`รูปแบบ JSON จาก Gemini ไม่ถูกต้อง: ${rawData.slice(0, 100)}`));
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          const errMsg = json?.error?.message || `HTTP ${res.statusCode}: ${res.statusMessage || 'Gemini API Error'}`;
          const err = new Error(errMsg);
          err.status = res.statusCode;
          return reject(err);
        }

        resolve(json);
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('การเชื่อมต่อไปยัง Google Gemini API หมดเวลา (Timeout 5 วินาที)'));
    });

    req.on('error', (e) => {
      reject(new Error(`เชื่อมต่อ Google Gemini API ไม่สำเร็จ (${e.code || e.message})`));
    });

    req.write(postData);
    req.end();
  });
}

async function callGeminiApi(modelName, apiKey, payload) {
  try {
    return await callGeminiHttps(modelName, apiKey, payload);
  } catch (httpsErr) {
    if (typeof fetch === 'function') {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          const errMsg = data?.error?.message || response.statusText;
          const error = new Error(errMsg);
          error.status = response.status;
          throw error;
        }
        return data;
      } catch (fetchErr) {
        throw new Error(httpsErr.message || fetchErr.cause?.message || fetchErr.message);
      }
    }
    throw httpsErr;
  }
}

// POST /api/chat
// Main endpoint for chatbot interactions
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { message, history } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'กรุณากรอกข้อความคำถาม' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.trim() === '' || apiKey === 'YOUR_GEMINI_API_KEY') {
      return res.json({
        reply:
          '⚠️ ขณะนี้ยังไม่ได้ตั้งค่า `GEMINI_API_KEY` ในไฟล์ `.env` ของเซิร์ฟเวอร์\n\n' +
          'กรุณานำ API Key จาก Google AI Studio มาใส่ในไฟล์ `.env`:\n' +
          '`GEMINI_API_KEY=AIzaSy...`\n' +
          'แล้วรีสตาร์ทเซิร์ฟเวอร์เพื่อเริ่มใช้งาน AI Chatbot ครับ',
      });
    }

    const userId = req.user?.id;
    const username = req.user?.username || 'ลูกค้า';
    const shopName = process.env.SHOP_NAME || 'hello test.t';

    // System instruction defining persona & capabilities
    const systemInstruction = {
      parts: [
        {
          text:
            `คุณคือ "${shopName}" AI Chatbot ผู้ช่วยประจำร้านค้าออนไลน์ ${shopName}\n` +
            `ผู้ใช้ที่กำลังคุยด้วยคือคุณ "${username}" (User ID: ${userId})\n\n` +
            `หน้าที่ของคุณ:\n` +
            `1. ให้ข้อมูลสินค้า แนะนำสินค้า สเปก ราคา และตรวจสอบจำนวนสต็อกคงเหลือจากฐานข้อมูลจริงของร้าน (ใช้เครื่องมือ search_products หรือ check_product_stock)\n` +
            `2. ตรวจสอบสถานะคำสั่งซื้อ ประวัติการสั่งซื้อ และสถานะพัสดุของลูกค้า (ใช้เครื่องมือ get_my_orders)\n` +
            `3. ตรวจสอบสถานะการส่งเคลมสินค้า (ใช้เครื่องมือ get_my_claims)\n` +
            `4. ให้คำตอบที่สุภาพ เป็นมิตร ใช้ภาษาไทยที่เข้าใจง่าย ใช้คำลงท้าย "ครับ"\n` +
            `5. ถ้าสินค้ามีโปรโมชั่น หรือลดราคา ให้แจ้งราคาปกติและราคาโปรโมชั่นให้ลูกค้าทราบ\n` +
            `6. ห้ามเดาหรือแต่งตัวเลขสต็อกและราคาเอง ต้องดึงข้อมูลจากเครื่องมือที่ให้ไปเท่านั้น\n` +
            `7. จัดรูปแบบข้อความเป็นระเบียบ ใช้ bullet points หรือตัวหนา (Markdown) เมื่อแสดงรายการสินค้าหรือสถานะออเดอร์`,
        },
      ],
    };

    // Format chat history for Gemini
    const contents = [];
    if (Array.isArray(history)) {
      for (const h of history.slice(-8)) {
        if (h && (h.role === 'user' || h.role === 'model') && typeof h.text === 'string') {
          contents.push({
            role: h.role,
            parts: [{ text: h.text }],
          });
        }
      }
    }
    // Append current user message
    contents.push({
      role: 'user',
      parts: [{ text: message.trim() }],
    });

    const payload = {
      system_instruction: systemInstruction,
      contents,
      tools: GEMINI_TOOLS,
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 1024,
      },
    };

    // Attempt Gemini call with fallback models
    const modelsToTry = [DEFAULT_MODEL, ...FALLBACK_MODELS.filter((m) => m !== DEFAULT_MODEL)];
    let responseData = null;
    let usedModel = null;
    let lastError = null;

    for (const model of modelsToTry) {
      try {
        responseData = await callGeminiApi(model, apiKey, payload);
        usedModel = model;
        break;
      } catch (err) {
        lastError = err;
        console.warn(`Gemini model ${model} failed (${err.message}), trying next model...`);
      }
    }

    if (!responseData) {
      throw lastError || new Error('ไม่สามารถติดต่อบริการ Gemini API ได้');
    }

    // Handle Function Calling loop (up to 3 turns)
    let turns = 0;
    while (turns < 3) {
      const candidate = responseData.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      const functionCallPart = parts.find((p) => p.functionCall);

      if (!functionCallPart) {
        // No function call, we have the final textual answer
        break;
      }

      turns++;
      const fn = functionCallPart.functionCall;
      console.log(`[Chatbot] AI called tool: ${fn.name} with args:`, fn.args);

      // Execute tool on MySQL DB
      const toolResult = await handleToolCall(fn.name, fn.args, userId);

      // Append model's tool call and function's response to contents
      payload.contents.push({
        role: 'model',
        parts: [{ functionCall: fn }],
      });

      payload.contents.push({
        role: 'function',
        parts: [
          {
            functionResponse: {
              name: fn.name,
              response: { output: toolResult },
            },
          },
        ],
      });

      // Call Gemini again to continue conversation
      responseData = await callGeminiApi(usedModel, apiKey, payload);
    }

    // Extract final text from Gemini
    const finalCandidate = responseData.candidates?.[0];
    const finalParts = finalCandidate?.content?.parts || [];
    const textPart = finalParts.find((p) => p.text);
    const replyText = textPart?.text || 'ขออภัยครับ ไม่สามารถสร้างคำตอบได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง';

    res.json({ reply: replyText });
  } catch (err) {
    console.error('Chatbot error:', err);
    const causeMsg = err.cause?.message || err.cause?.code || '';
    const fullMsg = causeMsg ? `${err.message} (${causeMsg})` : err.message;
    res.status(500).json({
      error: 'เกิดข้อผิดพลาดในการประมวลผลของ AI: ' + (fullMsg || 'โปรดลองใหม่อีกครั้ง'),
    });
  }
});

module.exports = router;
