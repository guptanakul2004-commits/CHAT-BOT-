const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const LOCAL_USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

function isMongoReady() {
  return mongoose.connection.readyState === 1;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function publicUser(user) {
  return {
    id: String(user._id || user.id),
    name: user.name,
    email: user.email,
  };
}

function signToken(user) {
  return jwt.sign(
    { id: String(user._id || user.id), email: user.email },
    process.env.JWT_SECRET || 'SECRET_KEY',
    { expiresIn: '7d' }
  );
}

function readLocalUsers() {
  try {
    if (!fs.existsSync(LOCAL_USERS_FILE)) return [];
    return JSON.parse(fs.readFileSync(LOCAL_USERS_FILE, 'utf8'));
  } catch (err) {
    console.error('Local user read error:', err.message);
    return [];
  }
}

function writeLocalUsers(users) {
  fs.mkdirSync(path.dirname(LOCAL_USERS_FILE), { recursive: true });
  fs.writeFileSync(LOCAL_USERS_FILE, JSON.stringify(users, null, 2));
}

exports.register = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Name, email and password are required',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters',
      });
    }

    const hashed = await bcrypt.hash(password, 10);

    if (isMongoReady()) {
      const exists = await User.findOne({ email });
      if (exists) {
        return res.status(409).json({
          success: false,
          error: 'Email already registered',
        });
      }

      const user = await User.create({ name, email, password: hashed });
      return res.status(201).json({
        success: true,
        token: signToken(user),
        user: publicUser(user),
      });
    }

    const users = readLocalUsers();
    if (users.some(user => user.email === email)) {
      return res.status(409).json({
        success: false,
        error: 'Email already registered',
      });
    }

    const user = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      name,
      email,
      password: hashed,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    writeLocalUsers(users);

    res.status(201).json({
      success: true,
      token: signToken(user),
      user: publicUser(user),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

exports.login = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
      });
    }

    let user;

    if (isMongoReady()) {
      user = await User.findOne({ email });
    } else {
      user = readLocalUsers().find(item => item.email === email);
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({
        success: false,
        error: 'Invalid password',
      });
    }

    res.json({
      success: true,
      token: signToken(user),
      user: publicUser(user),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};
