require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const ejs = require('ejs');
const path = require('path');
const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const cheerio = require('cheerio');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const port = process.env.APP_PORT || 3000;

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middlewares
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
    secret: process.env.SESSION_SECRET || 'default-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// --- Globals & Helpers ---
let status = { lastCheck: null, processedCount: 0, lastError: null };
const logs = [];
const processedTransactions = []; // Store recent transactions for API lookup
function log(message) {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] ${message}`;
    console.log(formattedMessage);
    logs.unshift(formattedMessage);
    if (logs.length > 100) logs.pop();
}

// --- Authentication ---
const authMiddleware = (req, res, next) => {
    if (req.session.isAuthenticated) {
        return next();
    }
    res.redirect('/login');
};

const apiAuth = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey && apiKey === process.env.API_KEY) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized' });
};

// --- Routes ---
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
        req.session.isAuthenticated = true;
        res.redirect('/');
    } else {
        res.render('login', { error: 'Invalid username or password' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// Protected routes
app.get('/', authMiddleware, (req, res) => {
    ejs.renderFile(path.join(__dirname, 'views/dashboard.ejs'), {}, (err, str) => {
        if (err) {
            log(`EJS Error: ${err}`);
            return res.status(500).send('Error rendering page');
        }
        res.render('layout', {
            body: str,
            title: 'Dashboard',
            activePage: 'dashboard'
        });
    });
});
app.get('/api-docs', (req, res) => {

async function fetchEmails(limit = 20) {
    log("Fetching recent emails for display...");
    try {
        const connection = await imaps.connect(imapConfig);
        await connection.openBox('INBOX');

        const searchCriteria = [['FROM', 'no-reply@cake.vn']];
        // Fetch full bodies to ensure proper parsing, instead of just headers.
        const fetchOptions = { bodies: [''], markSeen: false };

        const messages = await connection.search(searchCriteria, fetchOptions);

        const recentMessages = messages.slice(-limit).reverse();

        let emails = [];
        for (const message of recentMessages) {
            const fullMessage = message.parts.find(part => part.which === '').body;
            const parsed = await simpleParser(fullMessage);
            emails.push({
                uid: message.attributes.uid,
                from: parsed.from.text,
                subject: parsed.subject,
                date: parsed.date,
            });
        }

        connection.end();
        log(`Successfully fetched ${emails.length} emails.`);
        return emails;
    } catch (error) {
        log(`Error fetching emails for display: ${error.message}`);
        status.lastError = `Failed to fetch emails: ${error.message}`;
        return [];
    }
}

app.get('/emails', authMiddleware, async (req, res) => {
    const emails = await fetchEmails();
    ejs.renderFile(path.join(__dirname, 'views/emails.ejs'), { emails }, (err, str) => {
        if (err) {
            log(`EJS Error: ${err}`);
            return res.status(500).send('Error rendering page');
        }
        res.render('layout', {
            body: str,
            title: 'Inbox',
            activePage: 'emails'
        });
    });
});

app.get('/email/:uid', authMiddleware, async (req, res) => {
    const uid = req.params.uid;
    log(`Fetching email with UID: ${uid}`);
    try {
        const connection = await imaps.connect(imapConfig);
        await connection.openBox('INBOX');
        const fetchOptions = { bodies: [''], markSeen: false };
        const messages = await connection.search([['UID', uid]], fetchOptions);
        
        if (messages.length > 0) {
            const fullMessage = messages[0].parts.find(part => part.which === '').body;
            const parsedEmail = await simpleParser(fullMessage);
            
            ejs.renderFile(path.join(__dirname, 'views/email-detail.ejs'), { email: parsedEmail }, (err, str) => {
                 if (err) {
                    log(`EJS Error: ${err}`);
                    return res.status(500).send('Error rendering page');
                }
                res.render('layout', {
                    body: str,
                    title: parsedEmail.subject,
                    activePage: 'emails'
                });
            });
        } else {
            res.status(404).send("Email not found.");
        }
        connection.end();
    } catch (error) {
        log(`Error fetching email detail: ${error.message}`);
        res.status(500).send("Error fetching email.");
    }
});

const fs = require('fs');
const { exec } = require('child_process');

function updateEnvFile(settings) {
    const envPath = path.join(__dirname, '.env');
    let content = fs.readFileSync(envPath, { encoding: 'utf8' });

    for (const key in settings) {
        if (settings[key]) { // Only update if a value is provided
            const regex = new RegExp(`^${key}=.*`, 'm');
            const newValue = `${key}=${settings[key]}`;
            if (content.match(regex)) {
                content = content.replace(regex, newValue);
            } else {
                content += `\n${newValue}`;
            }
        }
    }
    fs.writeFileSync(envPath, content);
    log(".env file updated.");
}

app.get('/settings', authMiddleware, (req, res) => {
    const currentSettings = {
        IMAP_HOST: process.env.IMAP_HOST || '',
        IMAP_USER: process.env.IMAP_USER || '',
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
        TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',
        CHECK_INTERVAL_SECONDS: process.env.CHECK_INTERVAL_SECONDS || 15,
        API_KEY: process.env.API_KEY || '',
    };
    ejs.renderFile(path.join(__dirname, 'views/settings.ejs'), { settings: currentSettings }, (err, str) => {
        if (err) {
            log(`EJS Error: ${err}`);
            return res.status(500).send('Error rendering page');
        }
        res.render('layout', {
            body: str,
            title: 'Settings',
            activePage: 'settings'
        });
    });
});

app.get('/api-docs', authMiddleware, (req, res) => {

app.post('/settings', authMiddleware, (req, res) => {
    updateEnvFile(req.body);
    
    log("Restarting application to apply settings...");
    exec('npm run restart', (error, stdout, stderr) => {
        if (error) {
            log(`Restart error: ${error.message}`);
            return res.status(500).send("Error restarting application.");
        }
        log(`Restart stdout: ${stdout}`);
        log(`Restart stderr: ${stderr}`);
        // The response may not be sent if the server restarts too quickly.
        // This is more for logging purposes.
        res.redirect('/settings');
    });
});

app.get('/status', authMiddleware, (req, res) => {
    res.json({ ...status, logs });
});

// Test endpoint to check data extraction
app.get('/test-extraction', authMiddleware, async (req, res) => {
    try {
        const fs = require('fs');
        const emailContent = fs.readFileSync(path.join(__dirname, '[CAKE]-Thong-bao-giao-dich-thanh-cong.txt'), 'utf8');
        
        // Parse the email using mailparser
        const { simpleParser } = require('mailparser');
        const parsed = await simpleParser(emailContent);
        
        log("Testing data extraction with sample email...");
        const extractedData = await extractTransactionData(parsed.html);
        
        res.json({
            success: true,
            extractedData: extractedData,
            originalHtml: parsed.html ? parsed.html.substring(0, 1000) + "..." : "No HTML found"
        });
    } catch (error) {
        log(`Test extraction error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// --- API Routes ---
app.get('/api/recent-credit-transactions', apiAuth, (req, res) => {
    const { since } = req.query; // Optional timestamp to get transactions since a specific time
    
    // Filter for credit transactions (amount starts with '+')
    let creditTransactions = processedTransactions.filter(tx =>
        tx.amount && tx.amount.startsWith('+')
    );
    
    // If 'since' parameter is provided, filter by timestamp
    if (since) {
        const sinceDate = new Date(since);
        creditTransactions = creditTransactions.filter(tx => {
            // Assuming dateTime is in format from CAKE emails
            const txDate = new Date(tx.dateTime);
            return txDate > sinceDate;
        });
    }
    
    log(`[API] Returning ${creditTransactions.length} credit transactions`);
    res.json({
        success: true,
        count: creditTransactions.length,
        transactions: creditTransactions,
        timestamp: new Date().toISOString()
    });
});

app.post('/api/check-transaction', apiAuth, async (req, res) => {
    const { amount, content } = req.body;
    if (!amount || !content) {
        return res.status(400).json({ error: 'Missing amount or content' });
    }

    log(`[API] Received check for amount: ${amount}, content: ${content}`);

    const cleanAmount = (val) => val.replace(/[\.,+đ\s]/g, '');
    const targetAmount = cleanAmount(String(amount));

    const findTransaction = () => {
        return processedTransactions.find(tx => {
            const txAmount = cleanAmount(tx.amount);
            const txContent = tx.content.toLowerCase();
            return txAmount === targetAmount && txContent.includes(content.toLowerCase());
        });
    };

    // Check immediately, then poll for a short period
    let foundTx = findTransaction();
    if (foundTx) {
        log(`[API] Transaction found immediately.`);
        return res.json({ status: 'found', transaction: foundTx });
    }

    const maxRetries = 12; // Poll for 60 seconds (12 * 5s)
    let retries = 0;
    const interval = setInterval(() => {
        foundTx = findTransaction();
        if (foundTx || retries >= maxRetries) {
            clearInterval(interval);
            if (foundTx) {
                log(`[API] Transaction found after ${retries * 5}s.`);
                return res.json({ status: 'found', transaction: foundTx });
            } else {
                log(`[API] Transaction not found after 60s.`);
                return res.status(404).json({ status: 'not_found' });
            }
        }
        retries++;
    }, 5000);
});


// --- Email Processing Logic ---
const imapConfig = {
    imap: {
        user: process.env.IMAP_USER,
        password: process.env.IMAP_PASSWORD,
        host: process.env.IMAP_HOST,
        port: process.env.IMAP_PORT,
        tls: process.env.IMAP_TLS === 'true',
        authTimeout: 3000,
        tlsOptions: { rejectUnauthorized: false }
    }
};
// Bot initialization is wrapped to avoid errors if token is not set
let bot;
if (process.env.TELEGRAM_BOT_TOKEN) {
    bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
} else {
    log("TELEGRAM_BOT_TOKEN not found. Telegram notifications are disabled.");
}


async function extractTransactionData(htmlBody) {
    log("Extracting data from email body...");
    
    // Helper function to decode quoted-printable and clean text
    const cleanText = (text) => {
        if (!text) return 'N/A';
        return text
            .replace(/=3D/g, '=')
            .replace(/=C3=A0/g, 'à')
            .replace(/=C3=A1/g, 'á')
            .replace(/=C3=A2/g, 'â')
            .replace(/=C3=A3/g, 'ã')
            .replace(/=E1=BA=A3/g, 'ả')
            .replace(/=E1=BA=A1/g, 'ạ')
            .replace(/=C3=A8/g, 'è')
            .replace(/=C3=A9/g, 'é')
            .replace(/=C3=AA/g, 'ê')
            .replace(/=E1=BB=81/g, 'ế')
            .replace(/=E1=BB=83/g, 'ể')
            .replace(/=E1=BB=85/g, 'ễ')
            .replace(/=E1=BB=87/g, 'ệ')
            .replace(/=C3=AC/g, 'ì')
            .replace(/=C3=AD/g, 'í')
            .replace(/=C4=A9/g, 'ĩ')
            .replace(/=E1=BB=89/g, 'ỉ')
            .replace(/=E1=BB=8B/g, 'ị')
            .replace(/=C3=B2/g, 'ò')
            .replace(/=C3=B3/g, 'ó')
            .replace(/=C3=B4/g, 'ô')
            .replace(/=C3=B5/g, 'õ')
            .replace(/=E1=BB=8F/g, 'ỏ')
            .replace(/=E1=BB=91/g, 'ọ')
            .replace(/=C6=B0/g, 'ư')
            .replace(/=E1=BB=A9/g, 'ủ')
            .replace(/=E1=BB=A5/g, 'ụ')
            .replace(/=E1=BB=9D/g, 'ỳ')
            .replace(/=E1=BB=B3/g, 'ỷ')
            .replace(/=E1=BB=B5/g, 'ỹ')
            .replace(/=C4=91/g, 'đ')
            .replace(/=E1=BB=83n/g, 'ển')
            .replace(/=E1=BB=9Di/g, 'ời')
            .replace(/=E1=BB=ADn/g, 'ận')
            .replace(/=E1=BB=A3n/g, 'ợn')
            .replace(/=E1=BB=8Bch/g, 'ịch')
            .replace(/=E1=BB=9D/g, 'ỽ')
            .replace(/=E1=BA=BFn/g, 'ến')
            .replace(/=\s*\n/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    };

    try {
        // Clean the HTML body first
        const cleanedHtml = cleanText(htmlBody);
        
        // Use regex patterns to extract data directly from cleaned HTML
        const extractPatterns = {
            // Tài khoản nhận
            receivingAccount: () => {
                const patterns = [
                    /0972614889[^<>\n]*(?:Tài khoản thanh toán|thanh toán)/i,
                    /0972614889[^<>\n]*/
                ];
                for (const pattern of patterns) {
                    const match = cleanedHtml.match(pattern);
                    if (match) return match[0].trim();
                }
                return 'N/A';
            },
            
            // Tài khoản chuyển
            sendingAccount: () => {
                const pattern = /808888880/;
                const match = cleanedHtml.match(pattern);
                return match ? match[0] : 'N/A';
            },
            
            // Tên người chuyển
            senderName: () => {
                const pattern = /MBBANK IBFT/;
                const match = cleanedHtml.match(pattern);
                return match ? match[0] : 'N/A';
            },
            
            // Ngân hàng chuyển
            sendingBank: () => {
                const patterns = [/MBB(?!\w)/, /MB Bank/i];
                for (const pattern of patterns) {
                    const match = cleanedHtml.match(pattern);
                    if (match) return match[0];
                }
                return 'N/A';
            },
            
            // Loại giao dịch
            transactionType: () => {
                const pattern = /Chuyển tiền ngoài CAKE/;
                const match = cleanedHtml.match(pattern);
                return match ? match[0] : 'N/A';
            },
            
            // Mã giao dịch
            transactionCode: () => {
                const patterns = [
                    /269743028/,
                    /\d{9}/  // 9 digit transaction code
                ];
                for (const pattern of patterns) {
                    const match = cleanedHtml.match(pattern);
                    if (match) return match[0];
                }
                return 'N/A';
            },
            
            // Ngày giờ giao dịch
            dateTime: () => {
                const patterns = [
                    /\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}:\d{2}/,
                    /\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}/,
                    /\d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}:\d{2}:\d{2}/
                ];
                for (const pattern of patterns) {
                    const match = cleanedHtml.match(pattern);
                    if (match) return match[0];
                }
                return 'N/A';
            },
            
            // Số tiền
            amount: () => {
                const patterns = [
                    /\+150\.000[^<>\n]*đ/,
                    /\+\s*150\.000[^<>\n]*đ/,
                    /\+150[,.]000[^<>\n]*đ/,
                    /\+\d{1,3}[,.]?\d{3}[,.]?\d{3}[^<>\n]*đ/,  // More generic pattern
                    /\+\d{1,3}[,.]?\d{3}[^<>\n]*đ/  // Smaller amounts
                ];
                for (const pattern of patterns) {
                    const match = cleanedHtml.match(pattern);
                    if (match) return match[0].trim();
                }
                return 'N/A';
            },
            
            // Phí giao dịch
            fee: () => {
                const patterns = [/0\s*đ/, /0 đ/];
                for (const pattern of patterns) {
                    const match = cleanedHtml.match(pattern);
                    if (match) return match[0].trim();
                }
                return 'N/A';
            },
            
            // Nội dung giao dịch
            content: () => {
                const patterns = [
                    /NGUYEN THANH QUAN chuyen tien/,
                    /NGUYEN THANH QUAN[^<>\n]*chuyen[^<>\n]*tien/i
                ];
                for (const pattern of patterns) {
                    const match = cleanedHtml.match(pattern);
                    if (match) return match[0].trim();
                }
                return 'N/A';
            }
        };

        // Extract data using the patterns
        const transactionData = {};
        Object.keys(extractPatterns).forEach(key => {
            transactionData[key] = extractPatterns[key]();
        });

        // Log the extracted data for debugging
        log(`Extracted data: ${JSON.stringify(transactionData, null, 2)}`);
        
        log("Data extraction completed.");
        return transactionData;
    } catch (error) {
        log(`Error extracting data: ${error.message}`);
        status.lastError = `Data extraction failed: ${error.message}`;
        return null;
    }
}

async function sendTelegramNotification(data) {
    if (!bot || !process.env.TELEGRAM_CHAT_ID) {
        log("Telegram bot not configured. Skipping notification.");
        return;
    }
    log(`Sending notification for transaction: ${data.transactionCode}`);
    const message = `
*Giao dịch mới từ CAKE*
-----------------------------------
*Tài khoản nhận:* ${data.receivingAccount}
*Tài khoản chuyển:* ${data.sendingAccount}
*Người chuyển:* ${data.senderName}
*Ngân hàng chuyển:* ${data.sendingBank}
-----------------------------------
*Loại giao dịch:* ${data.transactionType}
*Mã giao dịch:* ${data.transactionCode}
*Thời gian:* ${data.dateTime}
*Số tiền:* ${data.amount}
*Phí:* ${data.fee}
*Nội dung:* \`${data.content}\`
    `;

    try {
        await bot.sendMessage(process.env.TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' });
        log("Telegram notification sent successfully.");
    } catch (error) {
        log(`Failed to send Telegram notification: ${error.message}`);
        status.lastError = `Telegram notification failed: ${error.message}`;
    }
}

async function checkAndProcessEmails() {
    status.lastCheck = new Date().toISOString();
    log("Checking for new emails...");

    try {
        const connection = await imaps.connect(imapConfig);
        await connection.openBox('INBOX');

        const searchCriteria = [
            'UNSEEN',
            ['FROM', 'no-reply@cake.vn'],
            ['SUBJECT', '[CAKE] Thông báo giao dịch thành công']
        ];
        const fetchOptions = { bodies: [''], markSeen: true };
        const messages = await connection.search(searchCriteria, fetchOptions);
        
        log(`Found ${messages.length} new email(s).`);

        for (const message of messages) {
            const fullMessage = message.parts.find(part => part.which === '').body;
            const parsedEmail = await simpleParser(fullMessage);
            const transactionData = await extractTransactionData(parsedEmail.html);
            if (transactionData) {
                // Store transaction for API lookup
                processedTransactions.unshift(transactionData);
                if (processedTransactions.length > 50) { // Keep last 50 transactions
                    processedTransactions.pop();
                }
                
                await sendTelegramNotification(transactionData);
                status.processedCount++;
            }
        }
        connection.end();
    } catch (error) {
        log(`Error checking email: ${error.message}`);
        status.lastError = `Email check failed: ${error.message}`;
    }
}


// --- Server Start ---
app.listen(port, () => {
    log(`Server is running on http://localhost:${port}`);
    if (process.env.IMAP_USER) {
        const interval = parseInt(process.env.CHECK_INTERVAL_SECONDS || 15, 10) * 1000;
        setInterval(checkAndProcessEmails, interval);
        log(`Email check scheduled every ${interval / 1000} seconds.`);
        checkAndProcessEmails(); // Run once on startup
    } else {
        log("IMAP_USER not found. Email checking is disabled.");
    }
});