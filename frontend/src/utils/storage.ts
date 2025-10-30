import * as CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = 'your-secret-key-here-change-this'; // Should be from env

export const encryptData = (data: any): string => {
  const jsonString = JSON.stringify(data);
  return CryptoJS.AES.encrypt(jsonString, ENCRYPTION_KEY).toString();
};

export const decryptData = (encryptedData: string): any => {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
    const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
    return JSON.parse(decryptedString);
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
};

export const storage = {
  set: (key: string, value: any): void => {
    const encrypted = encryptData(value);
    localStorage.setItem(key, encrypted);
  },

  get: (key: string): any => {
    const encrypted = localStorage.getItem(key);
    if (!encrypted) return null;
    return decryptData(encrypted);
  },

  remove: (key: string): void => {
    localStorage.removeItem(key);
  },

  clear: (): void => {
    localStorage.clear();
  },

  exportData: (): string => {
    const data: Record<string, any> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        data[key] = localStorage.getItem(key);
      }
    }
    return JSON.stringify(data);
  },

  importData: (jsonString: string): void => {
    try {
      const data = JSON.parse(jsonString);
      Object.keys(data).forEach(key => {
        localStorage.setItem(key, data[key]);
      });
    } catch (error) {
      console.error('Import error:', error);
      throw new Error('Invalid data format');
    }
  },
};
