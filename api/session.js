import { isLoggedIn } from '../lib/auth.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ innlogget: isLoggedIn(req), ai: true });
}
