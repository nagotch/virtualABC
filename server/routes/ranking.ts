import { Hono } from 'hono';
import { getRanking } from './contests';

const app = new Hono();

// GET /api/ranking → 全ユーザーの確定レートランキング（降順）
app.get('/', async (c) => {
  const ranking = await getRanking();
  return c.json({ ranking });
});

export default app;
