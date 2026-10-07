import { URL } from "node:url";
import { connect, isReady, users, expenses, toId, mapExpense } from "./db.js";
import { createApp, readJson, sendEmpty, sendJson, serveStatic } from "./http.js";
import { getUserFromRequest, hashPassword, signToken, verifyPassword } from "./middleware/auth.js";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

function usernameQuery(username) {
  return new RegExp("^" + username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i");
}

function requireUser(req, res) {
  const user = getUserFromRequest(req);
  if (!user) {
    sendJson(res, 401, { error: "No autenticado" });
    return null;
  }
  return user;
}

function cleanCategory(value) {
  return String(value || "").trim().slice(0, 32) || "General";
}

function money(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100) / 100;
}

const server = createApp(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname, searchParams } = url;
  const method = req.method || "GET";

  if (pathname === "/health") return sendJson(res, 200, { ok: true, db: isReady() });
  if (pathname.startsWith("/api/") && !isReady()) return sendJson(res, 503, { error: "Base no lista" });
  if (!pathname.startsWith("/api/")) return serveStatic(req, res);

  if (method === "POST" && pathname === "/api/auth/register") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!USERNAME_RE.test(username)) return sendJson(res, 400, { error: "Usuario: 3-20 caracteres, letras, numeros y _" });
    if (password.length < 6) return sendJson(res, 400, { error: "La contrasena debe tener al menos 6 caracteres" });
    if (await users().findOne({ username: usernameQuery(username) })) return sendJson(res, 409, { error: "Ese usuario ya existe" });
    const result = await users().insertOne({ username, passwordHash: hashPassword(password), createdAt: new Date() });
    const user = { id: String(result.insertedId), username };
    return sendJson(res, 201, { user, token: signToken(user) });
  }

  if (method === "POST" && pathname === "/api/auth/login") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const row = await users().findOne({ username: usernameQuery(username) });
    if (!row || !verifyPassword(password, row.passwordHash)) return sendJson(res, 401, { error: "Usuario o contrasena incorrectos" });
    const user = { id: String(row._id), username: row.username };
    return sendJson(res, 200, { user, token: signToken(user) });
  }

  if (method === "GET" && pathname === "/api/auth/me") {
    const user = requireUser(req, res);
    if (!user) return;
    const id = toId(user.id);
    const row = id ? await users().findOne({ _id: id }) : null;
    if (!row) return sendJson(res, 401, { error: "Usuario no encontrado" });
    return sendJson(res, 200, { user: { id: String(row._id), username: row.username } });
  }

  if (pathname === "/api/expenses" || pathname.startsWith("/api/expenses/") || pathname === "/api/categories") {
    const user = requireUser(req, res);
    if (!user) return;
    const userId = user.id;

    if (method === "GET" && pathname === "/api/categories") {
      const rows = await expenses().aggregate([
        { $match: { userId } },
        { $group: { _id: "$category", count: { $sum: 1 }, total: { $sum: "$amount" } } },
        { $sort: { _id: 1 } },
      ]).toArray();
      return sendJson(res, 200, { categories: rows.map((row) => ({ name: row._id, count: row.count, total: row.total })) });
    }

    if (method === "GET" && pathname === "/api/expenses") {
      const q = String(searchParams.get("q") || "").trim();
      const category = String(searchParams.get("category") || "").trim();
      const query = { userId };
      if (category && category !== "Todas") query.category = category;
      if (q) {
        const rx = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
        query.$or = [{ title: rx }, { note: rx }, { category: rx }];
      }
      const rows = await expenses().find(query).sort({ spentAt: -1 }).limit(200).toArray();
      const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
      return sendJson(res, 200, { expenses: rows.map(mapExpense), total: Math.round(total * 100) / 100 });
    }

    if (method === "POST" && pathname === "/api/expenses") {
      const body = await readJson(req);
      const title = String(body.title || "").trim();
      const amount = money(body.amount);
      if (!title) return sendJson(res, 400, { error: "El concepto es obligatorio" });
      if (!amount) return sendJson(res, 400, { error: "El monto tiene que ser mayor a 0" });
      const now = new Date();
      const result = await expenses().insertOne({
        userId,
        title: title.slice(0, 80),
        amount,
        category: cleanCategory(body.category),
        note: String(body.note || "").slice(0, 240),
        spentAt: body.spentAt ? new Date(body.spentAt) : now,
        createdAt: now,
      });
      return sendJson(res, 201, { expense: mapExpense(await expenses().findOne({ _id: result.insertedId })) });
    }

    const match = pathname.match(/^\/api\/expenses\/([a-fA-F0-9]{24})$/);
    if (match) {
      const id = toId(match[1]);
      if (method === "PATCH") {
        const existing = await expenses().findOne({ _id: id, userId });
        if (!existing) return sendJson(res, 404, { error: "Gasto no encontrado" });
        const body = await readJson(req);
        const title = body.title !== undefined ? String(body.title).trim() : existing.title;
        const amount = body.amount !== undefined ? money(body.amount) : existing.amount;
        if (!title || !amount) return sendJson(res, 400, { error: "Concepto y monto son obligatorios" });
        await expenses().updateOne({ _id: id, userId }, {
          $set: {
            title: title.slice(0, 80),
            amount,
            category: body.category !== undefined ? cleanCategory(body.category) : existing.category,
            note: body.note !== undefined ? String(body.note).slice(0, 240) : existing.note,
            spentAt: body.spentAt ? new Date(body.spentAt) : existing.spentAt,
          },
        });
        return sendJson(res, 200, { expense: mapExpense(await expenses().findOne({ _id: id })) });
      }
      if (method === "DELETE") {
        const result = await expenses().deleteOne({ _id: id, userId });
        if (!result.deletedCount) return sendJson(res, 404, { error: "Gasto no encontrado" });
        return sendEmpty(res, 204);
      }
    }
  }

  sendJson(res, 404, { error: "Ruta no encontrada" });
});

server.listen(PORT, HOST, () => console.log(`Gastos en http://${HOST}:${PORT}`));

async function bootDb() {
  for (;;) {
    try {
      await connect();
      return;
    } catch (err) {
      console.error("Mongo no disponible:", err.message);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}
bootDb();
