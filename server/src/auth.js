require('dotenv').config();
const jwt = require('jsonwebtoken');
console.log('JWT_SECRET caricato:', process.env.JWT_SECRET ? 'SI' : 'NO');

// Verifica il token JWT — stessa chiave segreta usata in PHP
function verifyToken(token) {
    try {
        console.log('JWT_SECRET:', process.env.JWT_SECRET);
        console.log('Token ricevuto:', token);
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return {
            userId:   decoded.userId,
            userName: decoded.userName,
            email:    decoded.email
        };
    } catch (err) {
        console.log('Errore verifica:', err.message);
        return null;
    }
}

module.exports = { verifyToken };