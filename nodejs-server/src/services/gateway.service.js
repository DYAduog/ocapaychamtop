const Gateway = require('../models/Gateway');

const DEFAULT_GATEWAYS = [
  {
    code: 'timo',
    name: 'Timo',
    fullName: 'Timo Digital Bank (BVBank)',
    logo: '/images/timo-icon.png',
    fallbackLogo: '/images/timo.png',
    status: 'active',
    statusText: 'Hoạt động',
    badge: 'Digital Bank 24/7',
    notice: '',
    color: '#a855f7',
    order: 1,
  },
  {
    code: 'tpbank',
    name: 'TPBank',
    fullName: 'TPBank (Tiên Phong Bank)',
    logo: '/images/tpbank.png',
    fallbackLogo: '/images/tpbank.svg',
    status: 'active',
    statusText: 'Hoạt động',
    badge: 'API eBank v4',
    notice: '',
    color: '#5c2483',
    order: 2,
  },
  {
    code: 'mbbank',
    name: 'MBBank',
    fullName: 'MBBank (Quân Đội)',
    logo: '/images/mbbank.png',
    fallbackLogo: '/images/mbbank.svg',
    status: 'active',
    statusText: 'Hoạt động',
    badge: 'eMB Cloud Sync',
    notice: '',
    color: '#002855',
    order: 3,
  },
  {
    code: 'vcb',
    name: 'Vietcombank',
    fullName: 'Vietcombank (VCB Digibank)',
    logo: '/images/vietcombank.png',
    fallbackLogo: '/images/vietcombank.svg',
    status: 'active',
    statusText: 'Hoạt động',
    badge: 'VCB Digibank Auto',
    notice: '',
    color: '#005b38',
    order: 4,
  },
  {
    code: 'acb',
    name: 'ACB',
    fullName: 'ACB (Ngân Hàng Á Châu)',
    logo: '/images/acb.png',
    fallbackLogo: '/images/acb.svg',
    status: 'active',
    statusText: 'Hoạt động',
    badge: 'ACB Online 24/7',
    notice: '',
    color: '#005596',
    order: 5,
  },
  {
    code: 'bidv',
    name: 'BIDV',
    fullName: 'BIDV (SmartBanking V4)',
    logo: '/images/bidv.png',
    fallbackLogo: '/images/bidv.png',
    status: 'active',
    statusText: 'Hoạt động',
    badge: 'Big4 SmartBanking',
    notice: '',
    color: '#105caa',
    order: 6,
  },
  {
    code: 'viettin',
    name: 'VietinBank',
    fullName: 'VietinBank (iPay)',
    logo: '/images/vietinbank.png',
    fallbackLogo: '/images/vietinbank.svg',
    status: 'active',
    statusText: 'Hoạt động',
    badge: 'Big4 iPay Auto',
    notice: '',
    color: '#00529c',
    order: 7,
  },
  {
    code: 'techcombank',
    name: 'Techcombank',
    fullName: 'Techcombank (Mobile Banking)',
    logo: '/images/techcombank.jpg',
    fallbackLogo: '/images/techcombank.jpg',
    status: 'maintenance',
    statusText: 'Bảo trì',
    badge: 'Bảo trì Smart OTP',
    notice: 'Đang nâng cấp giao thức xác thực Smart OTP phiên bản mới',
    color: '#ea0029',
    order: 8,
  },
  {
    code: 'msb',
    name: 'MSB',
    fullName: 'MSB (Hàng Hải - DigiBank)',
    logo: '/images/msb.png',
    fallbackLogo: '/images/msb-35.png',
    status: 'active',
    statusText: 'Hoạt động',
    badge: 'DigiBank 24/7',
    notice: '',
    color: '#ea580c',
    order: 9,
  },
  {
    code: 'zalopay',
    name: 'ZaloPay',
    fullName: 'Ví Điện Tử ZaloPay',
    logo: '/images/zalopay.png',
    fallbackLogo: '/images/zalopay.png',
    status: 'active',
    statusText: 'Hoạt động',
    badge: 'Ví Điện Tử 24/7',
    notice: '',
    color: '#008fe5',
    order: 10,
  },
  {
    code: 'viettel',
    name: 'Viettel Money',
    fullName: 'Viettel Money (ViettelPay)',
    logo: '/images/viettel.png',
    fallbackLogo: '/images/viettel.png',
    status: 'active',
    statusText: 'Hoạt động',
    badge: 'Viettel Money 24/7',
    notice: '',
    color: '#ee0033',
    order: 11,
  },
  {
    code: 'ocb',
    name: 'OCB',
    fullName: 'OCB (Phương Đông - OMNI)',
    logo: '/images/ocb.png',
    fallbackLogo: '/images/ocb.png',
    status: 'active',
    statusText: 'Hoạt động',
    badge: 'OCB OMNI 4.0',
    notice: '',
    color: '#008853',
    order: 12,
  },
  {
    code: 'bvbank',
    name: 'BVBank',
    fullName: 'BVBank (Ngân Hàng Bản Việt)',
    logo: '/images/bvbank.png',
    fallbackLogo: '/images/bvbank.png',
    status: 'active',
    statusText: 'Hoạt động',
    badge: 'DigiBank 24/7',
    notice: '',
    color: '#005baa',
    order: 13,
  },
  {
    code: 'pgbank',
    name: 'PGBank',
    fullName: 'PGBank (Ngân Hàng Thịnh Vượng & Phát Triển)',
    logo: '/images/pgbank.png',
    fallbackLogo: '/images/pgbank.png',
    status: 'active',
    statusText: 'Hoạt động',
    badge: 'PGBank Omni 24/7',
    notice: '',
    color: '#0083ca',
    order: 14,
  },
  {
    code: 'eximbank',
    name: 'Eximbank',
    fullName: 'Eximbank (Ngân Hàng Xuất Nhập Khẩu Việt Nam - Edigi)',
    logo: '/images/eximbank.png',
    fallbackLogo: '/images/bank.png',
    status: 'active',
    statusText: 'Hoạt động',
    badge: 'Edigi Auto 24/7',
    notice: '',
    color: '#005baa',
    order: 15,
  },
];

const CODE_ALIASES = {
  vietcombank: 'vcb',
  mb: 'mbbank',
  tpb: 'tpbank',
  tcb: 'techcombank',
  zalo: 'zalopay',
  viettelpay: 'viettel',
  vietinbank: 'viettin',
  vtb: 'viettin',
  ocbomni: 'ocb',
  bvb: 'bvbank',
  banviet: 'bvbank',
  banvietbank: 'bvbank',
  pg: 'pgbank',
  pgb: 'pgbank',
  pgbankomni: 'pgbank',
  eib: 'eximbank',
  exim: 'eximbank',
};

class GatewayService {
  normalizeCode(code) {
    if (!code) return '';
    const lower = String(code).trim().toLowerCase();
    return CODE_ALIASES[lower] || lower;
  }

  getStatusText(status) {
    switch (status) {
      case 'active':
        return 'Hoạt động';
      case 'maintenance':
        return 'Bảo trì';
      case 'coming_soon':
        return 'Sắp ra mắt';
      case 'disabled':
        return 'Tắt (Ẩn cổng)';
      default:
        return 'Hoạt động';
    }
  }

  async seedDefaultGateways() {
    try {
      // Clean up deleted gateways (NCB and TheSieuRe)
      await Gateway.deleteMany({ code: { $in: ['ncb', 'thesieure', 'tsr'] } });

      for (const def of DEFAULT_GATEWAYS) {
        const existing = await Gateway.findOne({ code: def.code });
        if (!existing) {
          await Gateway.create(def);
        }
      }
    } catch (err) {
      console.warn('[GatewayService] Seed default gateways warning:', err.message);
    }
  }

  async getAllGateways() {
    await this.seedDefaultGateways();
    const list = await Gateway.find().sort({ order: 1 });
    return list;
  }

  async getGateway(code) {
    const normalized = this.normalizeCode(code);
    let gateway = await Gateway.findOne({ code: normalized });
    if (!gateway) {
      await this.seedDefaultGateways();
      gateway = await Gateway.findOne({ code: normalized });
    }
    return gateway;
  }

  async updateGatewayStatus(code, { status, statusText, notice }) {
    const normalized = this.normalizeCode(code);
    const validStatuses = ['active', 'maintenance', 'coming_soon', 'disabled'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Trạng thái không hợp lệ: "${status}". Hỗ trợ: ${validStatuses.join(', ')}`);
    }

    const effectiveStatusText = statusText || this.getStatusText(status);
    const updatePayload = {
      status,
      statusText: effectiveStatusText,
    };
    if (notice !== undefined) {
      updatePayload.notice = String(notice).trim();
    }

    let gateway = await Gateway.findOneAndUpdate(
      { code: normalized },
      { $set: updatePayload },
      { new: true, upsert: false }
    );

    if (!gateway) {
      // Find from default
      const defaultDef = DEFAULT_GATEWAYS.find((g) => g.code === normalized);
      if (defaultDef) {
        gateway = await Gateway.create({
          ...defaultDef,
          ...updatePayload,
        });
      } else {
        throw new Error(`Không tìm thấy cổng ngân hàng có mã: "${code}"`);
      }
    }

    return gateway;
  }

  async updateAllStatuses(status, notice = '') {
    const validStatuses = ['active', 'maintenance', 'coming_soon', 'disabled'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Trạng thái không hợp lệ: "${status}"`);
    }

    await this.seedDefaultGateways();
    const statusText = this.getStatusText(status);
    const updatePayload = { status, statusText };
    if (notice !== undefined && notice !== null) {
      updatePayload.notice = notice;
    }

    await Gateway.updateMany({}, { $set: updatePayload });
    return await this.getAllGateways();
  }
}

module.exports = new GatewayService();
