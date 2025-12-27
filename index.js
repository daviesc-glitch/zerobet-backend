const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios');

const User = require('./models/User');
const Bet = require('./models/Bet');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log('Mongo error:', err));

app.use(cors());
app.use(express.json());

const BASE_URL = 'https://api.the-odds-api.com/v4';
const API_KEY = process.env.API_KEY;

// ==================== AUTH ====================
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashed, balance: 10000 }); // £10,000 start
    await user.save();
    res.json({ message: 'User created successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, balance: user.balance });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ==================== ODDS API ====================
app.get('/api/sports', async (req, res) => {
  try {
    const response = await axios.get(`${BASE_URL}/sports?apiKey=${API_KEY}`);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/odds/:sport', async (req, res) => {
  const { sport } = req.params;
  const { regions = 'uk,eu', markets = 'h2h,spreads,totals', oddsFormat = 'decimal' } = req.query;
  try {
    const response = await axios.get(
      `${BASE_URL}/sports/${sport}/odds?apiKey=${API_KEY}&regions=${regions}&markets=${markets}&oddsFormat=${oddsFormat}`
    );
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== BALANCE & ADS ====================
app.get('/api/balance', auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json({ balance: user.balance });
});

app.post('/api/watch-ad', auth, async (req, res) => {
  const { adType } = req.body; // 'quick', 'short', 'premium'
  let amount = 0;
  let message = '';

  if (adType === 'quick') { amount = 1; message = '£1 added!'; }
  else if (adType === 'short') { amount = 3; message = '£3 added!'; }
  else if (adType === 'premium') { amount = 5; message = '£5 added!'; }
  else return res.status(400).json({ error: 'Invalid ad type' });

  try {
    const user = await User.findById(req.user.id);
    user.balance += amount;
    await user.save();
    res.json({ message, balance: user.balance });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add funds' });
  }
});

// Add more routes later (place bet, cash out, etc.)

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`ZEROBet backend running on port ${PORT}`));
