// Common utilities for 7Bank Web Portal
const API_BASE = '';

function getToken() {
  return localStorage.getItem('auth_token') || localStorage.getItem('7bank_token') || '';
}

function setToken(token) {
  if (token) {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('7bank_token', token);
  }
}

function clearAuth() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('7bank_token');
  localStorage.removeItem('7bank_user');
  window.location.replace('/login.html');
}

function formatMoney(amount) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(amount || 0));
}

function formatDate(dateStr) {
  if (!dateStr) return '---';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleString('vi-VN');
}

function formatDaysRemaining(timestampSec) {
  if (!timestampSec) return 'Hết hạn';
  const now = Math.floor(Date.now() / 1000);
  const diff = timestampSec - now;
  if (diff <= 0) return '<span style="color: var(--danger)">Hết hạn</span>';
  const days = Math.ceil(diff / 86400);
  return `<span style="color: var(--success)">Còn ${days} ngày</span>`;
}

// Toast System
function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Copy to Clipboard
function copyToClipboard(text, successMsg = 'Đã sao chép vào bộ nhớ tạm!') {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMsg, 'success');
    });
  } else {
    const input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
    showToast(successMsg, 'success');
  }
}

// Global fetch wrapper with Token
async function fetchWithAuth(url, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401 && !url.includes('/auth/login')) {
      clearAuth();
      return null;
    }
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('Fetch error:', err);
    showToast('Lỗi kết nối máy chủ: ' + err.message, 'error');
    throw err;
  }
}
