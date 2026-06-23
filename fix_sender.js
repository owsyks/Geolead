const { PrismaClient } = require('@prisma/client');
const { createCipheriv, createDecipheriv, randomBytes } = require('crypto');

const SECRET = process.env.OUTBOUND_SECRET_KEY;
if (!SECRET) { console.error('No OUTBOUND_SECRET_KEY'); process.exit(1); }

const KEY = Buffer.from(SECRET, 'hex').slice(0, 32);

function encrypt(text) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return 'enc:' + Buffer.concat([iv, tag, enc]).toString('base64');
}

const apiKey = 're_hGUkApBj_5WL1tcLLQbbKspd8DpNtC7pq';
const config = JSON.stringify({ apiKey });
const encrypted = encrypt(config);

const db = new PrismaClient();
// Update the sender that was missing the key (the one just verified by the user)
db.senderAccount.update({
  where: { id: 'e349f184-df67-426b-bb4e-73260cc352f7' },
  data: { providerConfig: encrypted },
}).then(r => {
  console.log('Updated sender:', r.fromEmail, r.id);
}).catch(e => {
  console.error('Error:', e.message);
}).finally(() => db.$disconnect());
