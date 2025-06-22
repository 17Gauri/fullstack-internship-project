const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
const PORT = 3000;

// Mongoose connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('✅ MongoDB connected');
    })
    .catch(err => {
        console.error('❌ MongoDB connection error:', err);
    });

mongoose.connection.on('connected', () => {
    console.log(`✅ Mongoose connected to DB: ${mongoose.connection.name}`);
});

// User Schema
const userSchema = new mongoose.Schema({
    username: String,
    email: { type: String, unique: true },
    age: Number,
    gender: String,
    password: String
});
const User = mongoose.model('User', userSchema);

// Middleware: body-parser
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Middleware: logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    next();
});

// Middleware: rate limiting
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 min
    max: 10,
    message: 'Too many requests! Please try again later.'
});
app.use('/api/', apiLimiter);

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes

// Home
app.get('/', async (req, res) => {
    try {
        const users = await User.find({});
        res.render('index', { submittedData: null, allData: users });
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).send('Error loading page');
    }
});

// Register User
app.post('/api/register', async (req, res) => {
    const { username, email, age, gender, password } = req.body;
    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User with this email already exists' });
        }

        const newUser = new User({ username, email, age, gender, password });
        await newUser.save();

        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        console.error('Error registering user:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get all users
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find({});
        res.json(users);
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update user
app.put('/api/users/:email', async (req, res) => {
    const { email } = req.params;
    const { username, age, gender, password } = req.body;

    try {
        const user = await User.findOneAndUpdate(
            { email },
            { username, age, gender, password },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({ message: 'User updated successfully', user });
    } catch (err) {
        console.error('Error updating user:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete user
app.delete('/api/users/:email', async (req, res) => {
    const { email } = req.params;

    try {
        const result = await User.deleteOne({ email });
        if (result.deletedCount === 0) {
            return res.status(404).send('User not found');
        }

        res.send('User deleted successfully');
    } catch (err) {
        console.error('Error deleting user:', err);
        res.status(500).send('Server error');
    }
});

// Server-side caching for /api/joke
let cachedJoke = null;
let jokeTimestamp = 0;

app.get('/api/joke', async (req, res) => {
    const now = Date.now();

    if (cachedJoke && now - jokeTimestamp < 60 * 1000) {
        console.log('✅ Returning cached joke');
        return res.json(cachedJoke);
    }

    try {
        const response = await fetch('https://official-joke-api.appspot.com/random_joke');
        const joke = await response.json();

        cachedJoke = joke;
        jokeTimestamp = now;

        res.json(joke);
    } catch (err) {
        console.error('Error fetching joke:', err);
        res.status(500).json({ message: 'Error fetching external API' });
    }
});

// Background Job: run every 10 seconds
cron.schedule('*/10 * * * * *', async () => {
    console.log(`[${new Date().toISOString()}] 🔄 Background job running...`);

    // Example: Count users
    const count = await User.countDocuments({});
    console.log(`👥 Total users in DB: ${count}`);
});

// Start server
app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
});
