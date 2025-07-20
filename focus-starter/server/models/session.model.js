const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date },
    duration: { type: Number }, // Duration in seconds
});

module.exports = mongoose.model('Session', sessionSchema);