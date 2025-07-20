const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const Session = require('../models/session.model');
const User = require('../models/user.model');

// --- Session Endpoints ---

router.post('/start-session', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ message: 'User ID is required.' });

        // Find or create a user
        await User.findOneAndUpdate({ userId }, { userId }, { upsert: true });

        const newSession = new Session({ userId, startTime: new Date() });
        const savedSession = await newSession.save();

        res.status(201).json({ sessionId: savedSession._id });
    } catch (error) {
        res.status(500).json({ message: 'Server error starting session', error: error.message });
    }
});

router.post('/end-session', async (req, res) => {
    try {
        const { sessionId } = req.body;
        if (!sessionId) return res.status(400).json({ message: 'Session ID is required.' });

        const session = await Session.findById(sessionId);
        if (!session) return res.status(404).json({ message: 'Session not found.' });

        session.endTime = new Date();
        session.duration = Math.round((session.endTime - session.startTime) / 1000); // duration in seconds
        await session.save();

        res.status(200).json({ message: 'Session ended successfully.', duration: session.duration });
    } catch (error) {
        res.status(500).json({ message: 'Server error ending session', error: error.message });
    }
});

router.get('/stats', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ message: 'User ID is required.' });

        // Get stats for the last 7 days using MongoDB Aggregation
        const sevenDaysAgo = new Date(new Date().setDate(new Date().getDate() - 7));

        const stats = await Session.aggregate([
            { $match: { userId, startTime: { $gte: sevenDaysAgo }, duration: { $exists: true } } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$startTime" } },
                    totalDuration: { $sum: "$duration" } // Sum of duration in seconds
                }
            },
            { $sort: { _id: 1 } } // Sort by date
        ]);

        res.status(200).json(stats);
    } catch (error) {
        res.status(500).json({ message: 'Server error fetching stats', error: error.message });
    }
});


// --- API Proxies ---

// FreeSound API Proxy to protect the API key
router.get('/api/music', async (req, res) => {
    const { type } = req.query;
    const query = encodeURIComponent(type);
    const url = `https://freesound.org/apiv2/search/text/?query=${query}&filter=duration:[300 TO 1800]&fields=name,previews,id&sort=downloads_desc&token=${process.env.FREESOUND_API_KEY}`;

    try {
        const apiRes = await fetch(url);
        const data = await apiRes.json();
        if (data.results && data.results.length > 0) {
            const sound = data.results[0]; // Get the most popular result
            res.json({ soundUrl: sound.previews['preview-hq-mp3'] });
        } else {
            res.status(404).json({ message: 'No sounds found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Freesound API error', error: error.message });
    }
});

// ZenQuotes API Proxy
router.get('/api/quote', async (req, res) => {
    try {
        const apiRes = await fetch('https://zenquotes.io/api/today');
        const data = await apiRes.json();
        res.json(data[0]);
    } catch (error) {
        res.status(500).json({ message: 'ZenQuotes API error', error: error.message });
    }
});

module.exports = router;