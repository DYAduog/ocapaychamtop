const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class CryptoService {
  constructor() {
    this.serverPublicKey = null;
    this.serverPrivateKey = null;
    this.clientPublicKey = null;
    this.clientPrivateKey = null;
    this.loadKeys();
  }

  loadKeys() {
    // Search candidates
    const searchDirs = [
      path.resolve(__dirname, '../../keys'),
      path.resolve(__dirname, '../../../core'),
      path.resolve(process.cwd(), 'keys'),
      path.resolve(process.cwd(), '../core'),
      path.resolve(process.cwd(), 'core'),
      'D:/7bank/core',
      'D:/7bank/nodejs-server/keys',
    ];

    if (process.env.KEYS_DIR) {
      searchDirs.unshift(path.resolve(process.cwd(), process.env.KEYS_DIR));
      searchDirs.unshift(path.resolve(__dirname, process.env.KEYS_DIR));
    }

    let foundDir = null;
    for (const dir of searchDirs) {
      if (fs.existsSync(dir) && fs.existsSync(path.join(dir, 'serverPublic.pem'))) {
        foundDir = dir;
        break;
      }
    }

    if (foundDir) {
      try {
        this.serverPublicKey = fs.readFileSync(path.join(foundDir, 'serverPublic.pem'), 'utf8');
        this.serverPrivateKey = fs.readFileSync(path.join(foundDir, 'serverPrivate.pem'), 'utf8');
        this.clientPublicKey = fs.readFileSync(path.join(foundDir, 'clientPublic.pem'), 'utf8');
        this.clientPrivateKey = fs.readFileSync(path.join(foundDir, 'clientPrivate.pem'), 'utf8');
        console.log(`[CryptoService] RSA PEM keys successfully loaded from: ${foundDir}`);
        return;
      } catch (err) {
        console.warn(`[CryptoService] Warning reading from ${foundDir}:`, err.message);
      }
    }

    // Fallback: Generate 2048-bit RSA pair if no files are found
    console.warn('[CryptoService] Keys not found in filesystem, generating fallback RSA 2048 keypair in memory...');
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    this.serverPublicKey = publicKey;
    this.serverPrivateKey = privateKey;
    this.clientPublicKey = publicKey;
    this.clientPrivateKey = privateKey;
  }

  /**
   * Encrypt bank password with serverPublic.pem (matching PHP encryptData)
   */
  encryptBankPassword(plainText) {
    if (!plainText) return '';
    if (!this.serverPublicKey) {
      this.loadKeys();
    }
    const buffer = Buffer.from(String(plainText), 'utf8');
    const encrypted = crypto.publicEncrypt(
      {
        key: this.serverPublicKey,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      buffer
    );
    return encrypted.toString('base64');
  }

  /**
   * Decrypt bank password with serverPrivate.pem (matching PHP decodecryptData)
   */
  decryptBankPassword(base64Cipher) {
    if (!base64Cipher) return '';
    if (!this.serverPrivateKey) {
      this.loadKeys();
    }
    const cleanBase64 = String(base64Cipher).replace(/[\r\n\s]+/g, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const decrypted = crypto.privateDecrypt(
      {
        key: this.serverPrivateKey,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      buffer
    );
    return decrypted.toString('utf8');
  }

  /**
   * SHA1 hash for user passwords (matching PHP sha1($password))
   */
  hashUserPassword(plainText) {
    return crypto.createHash('sha1').update(String(plainText)).digest('hex');
  }

  /**
   * MD5 helper (matching PHP md5($str))
   */
  md5(str) {
    return crypto.createHash('md5').update(String(str)).digest('hex');
  }

  /**
   * Generate random API token
   */
  generateToken(length = 32) {
    return crypto.randomBytes(length / 2).toString('hex');
  }
}

module.exports = new CryptoService();
