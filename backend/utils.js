const crypto = require('crypto');

function generateUSID() {
    // Generate 32 bytes (256 bits) of random data, convert to hex (64 characters)
    return crypto.randomBytes(32).toString('hex');
}

function hashUSID(usid) {
    // Hash the USID using SHA-256 and return hex string
    return crypto.createHash('sha256').update(usid).digest('hex');
}

module.exports = { generateUSID, hashUSID };