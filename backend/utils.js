const crypto = require('crypto');

function generateUSID() {
    // Generate a secure, random 256-bit USID
    return crypto.randomBytes(32).toString('hex');
}

function hashUSID(usid) {
    // Hash the USID using SHA-256 and return hex string
    return crypto.createHash('sha256').update(usid).digest('hex');
}

module.exports = { generateUSID, hashUSID };