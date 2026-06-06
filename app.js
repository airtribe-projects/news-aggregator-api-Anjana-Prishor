const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const axios = require('axios');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'news_aggregator_secret';
const NEWS_API_KEY = process.env.NEWS_API_KEY || '';
const NEWS_CACHE_TTL_MS = 60 * 1000;

// In-memory storage (development only)
const users = {};
const newsCache = {};

app.use(express.json());

// --- Validators ---
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const validateEmail = (email) => typeof email === 'string' && /^\S+@\S+\.\S+$/.test(email);
const validatePassword = (password) => typeof password === 'string' && password.length >= 6;
const validatePreferences = (preferences) => Array.isArray(preferences) && preferences.every((item) => isNonEmptyString(item));

const validateRegisterData = (body) => {
  if (!body || typeof body !== 'object') return 'Request body must be a JSON object';
  if (!isNonEmptyString(body.name)) return 'Name is required';
  if (!validateEmail(body.email)) return 'A valid email is required';
  if (!validatePassword(body.password)) return 'Password must be at least 6 characters';
  if (body.preferences !== undefined && !validatePreferences(body.preferences)) return 'Preferences must be an array of strings';
  return null;
};

const validateLoginData = (body) => {
  if (!body || typeof body !== 'object') return 'Request body must be a JSON object';
  if (!isNonEmptyString(body.email)) return 'Email is required';
  if (!isNonEmptyString(body.password)) return 'Password is required';
  return null;
};

const validatePreferencesData = (body) => {
  if (!body || typeof body !== 'object') return 'Request body must be a JSON object';
  if (!Object.prototype.hasOwnProperty.call(body, 'preferences')) return 'Preferences are required';
  if (!validatePreferences(body.preferences)) return 'Preferences must be an array of strings';
  return null;
};

// --- Middleware ---
const authenticate = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header missing or malformed' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = users[payload.email];
    if (!user) return res.status(401).json({ error: 'Invalid token' });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// --- Auth handlers ---
const signupHandler = async (req, res) => {
  const validationError = validateRegisterData(req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  const { name, email, password, preferences = [] } = req.body;
  if (users[email]) return res.status(409).json({ error: 'User already exists' });

  const passwordHash = await bcrypt.hash(password, 10);
  users[email] = { name, email, passwordHash, preferences };
  return res.status(200).json({ message: 'Signup successful' });
};

const loginHandler = async (req, res) => {
  const validationError = validateLoginData(req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  const { email, password } = req.body;
  const user = users[email];
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) return res.status(401).json({ error: 'Invalid email or password' });

  const token = jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: '1h' });
  return res.status(200).json({ token });
};

// --- Preferences handlers ---
const getPreferencesHandler = (req, res) => res.status(200).json({ preferences: req.user.preferences || [] });

const putPreferencesHandler = (req, res) => {
  const validationError = validatePreferencesData(req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  req.user.preferences = req.body.preferences;
  return res.status(200).json({ preferences: req.user.preferences });
};

// --- News helpers and handler ---
const buildFallbackNews = (preferences) => {
  const topics = preferences.length ? preferences : ['general'];
  return topics.slice(0, 5).map((topic, index) => ({
    title: `Top story for ${topic}`,
    description: `This is a personalized article summary for ${topic}.`,
    url: `https://example.com/news/${encodeURIComponent(topic)}/${index}`,
    source: { name: 'Mock News' },
    publishedAt: new Date(Date.now() - index * 3600000).toISOString(),
  }));
};

// Fetch news from external API (GNews)
const fetchExternalNews = async (preferences) => {
  const query = preferences.length ? preferences.join(' OR ') : 'latest';
  const url = new URL('https://gnews.io/api/v4/search');
  url.searchParams.set('q', query);
  url.searchParams.set('lang', 'en');
  url.searchParams.set('max', '10');
  url.searchParams.set('token', NEWS_API_KEY);

    const response = await axios.get(url.toString());
  const data = response.data;

  return Array.isArray(data.articles)
    ? data.articles.map((article) => ({
        title: article.title,
        description: article.description || '',
        url: article.url,
        source: { name: article.source?.name || 'Unknown' },
        publishedAt: article.publishedAt,
      }))
    : [];
};

// News handler with caching
const getNewsHandler = async (req, res) => {
  const cacheKey = `${req.user.email}:${req.user.preferences.join(',')}`;
  const cached = newsCache[cacheKey];
  if (cached && Date.now() - cached.timestamp < NEWS_CACHE_TTL_MS) return res.status(200).json({ news: cached.articles, source: 'cache' });

  try {
    const articles = NEWS_API_KEY ? await fetchExternalNews(req.user.preferences) : buildFallbackNews(req.user.preferences);
    newsCache[cacheKey] = { timestamp: Date.now(), articles };
    return res.status(200).json({ news: articles, source: NEWS_API_KEY ? 'gnews' : 'mock' });
  } catch (error) {
    return res.status(502).json({ error: error.message || 'Unable to fetch news' });
  }
};

// --- Error handler ---
const errorHandler = (err, req, res, next) => {
  console.error(err);
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }
  res.status(500).json({ error: 'Internal server error' });
};

// --- Routes ---
app.post('/register', signupHandler);
app.post('/login', loginHandler);
app.get('/preferences', authenticate, getPreferencesHandler);
app.put('/preferences', authenticate, putPreferencesHandler);
app.get('/news', authenticate, getNewsHandler);

app.use(errorHandler);

// Start server if this file is run directly
if (require.main === module) {
  app.listen(port, (err) => {
    if (err) {
      console.error('Server failed to start', err);
      process.exit(1);
    }
    console.log(`Server is listening on ${port}`);
  });
}

module.exports = app;