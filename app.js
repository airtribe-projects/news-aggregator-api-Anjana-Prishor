const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'news_aggregator_secret';
const NEWS_API_KEY = process.env.NEWS_API_KEY || '';
const NEWS_CACHE_TTL_MS = 60 * 1000;

const users = {};
const newsCache = {};

app.use(express.json());

const validateEmail = (email) => typeof email === 'string' && /^\S+@\S+\.\S+$/.test(email);
const validatePreferences = (preferences) => Array.isArray(preferences) && preferences.every((item) => typeof item === 'string');

// Authentication middleware
const authenticate = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header missing or malformed' });
  }

  // Extract token from header
  const token = header.slice(7);
  try {
    // Verify token and extract user info
    const payload = jwt.verify(token, JWT_SECRET);
    const user = users[payload.email];
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

app.post('/users/signup', async (req, res) => {
  const { name, email, password, preferences } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'A valid email is required' });
  }

  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  if (users[email]) {
    return res.status(409).json({ error: 'User already exists' });
  }

  if (preferences !== undefined && !validatePreferences(preferences)) {
    return res.status(400).json({ error: 'Preferences must be an array of strings' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  users[email] = {
    name,
    email,
    passwordHash,
    preferences: preferences || [],
  };

  return res.status(200).json({ message: 'Signup successful' });
});

app.post('/users/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = users[email];
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: '1h' });
  return res.status(200).json({ token });
});

app.get('/users/preferences', authenticate, (req, res) => {
  return res.status(200).json({ preferences: req.user.preferences });
});

app.put('/users/preferences', authenticate, (req, res) => {
  const { preferences } = req.body;

  if (!validatePreferences(preferences)) {
    return res.status(400).json({ error: 'Preferences must be an array of strings' });
  }

  req.user.preferences = preferences;
  return res.status(200).json({ preferences: req.user.preferences });
});

// Fake news generator for testing without an API key
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

// Fetch news from external API
const fetchExternalNews = async (preferences) => {
  const query = preferences.length ? preferences.join(' OR ') : 'latest';
  const url = new URL('https://gnews.io/api/v4/search');
  url.searchParams.set('q', query);
  url.searchParams.set('lang', 'en');
  url.searchParams.set('max', '10');
  url.searchParams.set('token', NEWS_API_KEY);

  const response = await fetch(url.toString());
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'External news API error');
  }

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

// News endpoint with caching
app.get('/news', authenticate, async (req, res) => {
  const cacheKey = `${req.user.email}:${req.user.preferences.join(',')}`;
  const cached = newsCache[cacheKey];

  if (cached && Date.now() - cached.timestamp < NEWS_CACHE_TTL_MS) {
    return res.status(200).json({ news: cached.articles, source: 'cache' });
  }

  // Fetch news from external API or fallback generator
  try {
    const articles = NEWS_API_KEY
      ? await fetchExternalNews(req.user.preferences)
      : buildFallbackNews(req.user.preferences);

    newsCache[cacheKey] = { timestamp: Date.now(), articles };
    return res.status(200).json({ news: articles, source: NEWS_API_KEY ? 'gnews' : 'mock' });
  } catch (error) {
    return res.status(502).json({ error: error.message || 'Unable to fetch news' });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

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