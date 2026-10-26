#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
7Bank Bot Hub - Phần Mềm Quản Lý Bot & Cho Thuê API Ngân Hàng
Giao diện Desktop hiện đại (CustomTkinter Dark Mode) chạy trực tiếp trên Windows.
Hỗ trợ 8 ngân hàng: ACB, BIDV, MBBank, TPBank, VCB, VietinBank, Techcombank, ZaloPay.
=============================================================================
"""

import json
import os
import sys
import threading
import time
import tkinter as tk
from datetime import datetime, timedelta
from tkinter import messagebox
from typing import Any, Dict, List, Optional

import customtkinter as ctk

# Thiết lập theme CustomTkinter
ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")

# Đảm bảo đường dẫn import
WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
if WORKSPACE_DIR not in sys.path:
    sys.path.insert(0, WORKSPACE_DIR)

import bot_bank_adapter as adapter
from bot_api_gateway import APIGatewayServer, AutoPollerAndWebhook
import bot_manager_db as db


class AddBankModal(ctk.CTkToplevel):
    """Cửa sổ Modal thêm tài khoản ngân hàng mới."""

    def __init__(self, parent, on_success_callback):
        super().__init__(parent)
        self.parent = parent
        self.on_success = on_success_callback

        self.title("Thêm Tài Khoản Ngân Hàng Mới")
        self.geometry("520 x 600")
        self.resizable(False, False)
        self.attributes("-topmost", True)

        self.setup_ui()

    def setup_ui(self):
        container = ctk.CTkFrame(self, corner_radius=12)
        container.pack(fill="both", expand=True, padx=20, pady=20)

        title_lbl = ctk.CTkLabel(
            container,
            text="🏦 KẾT NỐI BOT NGÂN HÀNG",
            font=ctk.CTkFont(size=18, weight="bold"),
        )
        title_lbl.pack(pady=(15, 15))

        # Chọn ngân hàng
        ctk.CTkLabel(container, text="Ngân Hàng:", anchor="w").pack(fill="x", padx=25, pady=(5, 2))
        bank_options = [
            f"{k} - {v['short_name']}" for k, v in adapter.SUPPORTED_BANKS.items()
        ]
        self.bank_var = ctk.StringVar(value=bank_options[0])
        self.bank_menu = ctk.CTkOptionMenu(container, values=bank_options, variable=self.bank_var, height=36)
        self.bank_menu.pack(fill="x", padx=25, pady=(0, 10))

        # Số tài khoản
        ctk.CTkLabel(container, text="Số Tài Khoản / Số Điện Thoại:", anchor="w").pack(fill="x", padx=25, pady=(5, 2))
        self.stk_entry = ctk.CTkEntry(container, placeholder_text="Ví dụ: 0869482825 hoặc 10005925592", height=36)
        self.stk_entry.pack(fill="x", padx=25, pady=(0, 10))

        # Tên đăng nhập
        ctk.CTkLabel(container, text="Tên Đăng Nhập (Username):", anchor="w").pack(fill="x", padx=25, pady=(5, 2))
        self.user_entry = ctk.CTkEntry(container, placeholder_text="Tên đăng nhập Internet Banking / SĐT", height=36)
        self.user_entry.pack(fill="x", padx=25, pady=(0, 10))

        # Mật khẩu
        ctk.CTkLabel(container, text="Mật Khẩu / Cookie (ZaloPay):", anchor="w").pack(fill="x", padx=25, pady=(5, 2))
        self.pwd_entry = ctk.CTkEntry(container, placeholder_text="Mật khẩu đăng nhập eBanking", show="*", height=36)
        self.pwd_entry.pack(fill="x", padx=25, pady=(0, 10))

        # Tên chủ tài khoản (tùy chọn)
        ctk.CTkLabel(container, text="Tên Chủ Tài Khoản (Tùy chọn):", anchor="w").pack(fill="x", padx=25, pady=(5, 2))
        self.name_entry = ctk.CTkEntry(container, placeholder_text="Ví dụ: NGUYEN VAN A", height=36)
        self.name_entry.pack(fill="x", padx=25, pady=(0, 15))

        # Thông báo trạng thái
        self.status_lbl = ctk.CTkLabel(container, text="", text_color="#EF4444")
        self.status_lbl.pack(pady=(0, 10))

        # Nút bấm hành động
        btn_frame = ctk.CTkFrame(container, fg_color="transparent")
        btn_frame.pack(fill="x", padx=25, pady=(5, 15))

        save_btn = ctk.CTkButton(
            btn_frame,
            text="💾 Lưu & Kiểm Tra Ngay",
            fg_color="#10B981",
            hover_color="#059669",
            height=40,
            command=self.save_bank,
        )
        save_btn.pack(side="left", fill="x", expand=True, padx=(0, 8))

        cancel_btn = ctk.CTkButton(
            btn_frame,
            text="Hủy",
            fg_color="#4B5563",
            hover_color="#374151",
            height=40,
            command=self.destroy,
        )
        cancel_btn.pack(side="right", fill="x", expand=True, padx=(8, 0))

    def save_bank(self):
        bank_raw = self.bank_var.get().split(" - ")[0].strip()
        stk = self.stk_entry.get().strip()
        user = self.user_entry.get().strip()
        pwd = self.pwd_entry.get().strip()
        acc_name = self.name_entry.get().strip()

        if not stk or not user or not pwd:
            self.status_lbl.configure(text="Vui lòng điền đầy đủ STK, Tên đăng nhập và Mật khẩu!")
            return

        bank_info = adapter.get_bank_info(bank_raw)
        bank_name = bank_info.get("name", bank_raw)

        bank_id = db.add_bank(
            bank_code=bank_raw,
            bank_name=bank_name,
            account_number=stk,
            username=user,
            password=pwd,
            account_name=acc_name,
        )

        self.destroy()
        if self.on_success:
            self.on_success(bank_id)


class AddClientModal(ctk.CTkToplevel):
    """Cửa sổ Modal tạo API Key cho khách thuê mới."""

    def __init__(self, parent, on_success_callback):
        super().__init__(parent)
        self.parent = parent
        self.on_success = on_success_callback

        self.title("Tạo API Key Cho Khách Thuê Mới")
        self.geometry("540 x 580")
        self.resizable(False, False)
        self.attributes("-topmost", True)

        self.setup_ui()

    def setup_ui(self):
        container = ctk.CTkFrame(self, corner_radius=12)
        container.pack(fill="both", expand=True, padx=20, pady=20)

        title_lbl = ctk.CTkLabel(
            container,
            text="🔑 TẠO API KEY CHO THUÊ",
            font=ctk.CTkFont(size=18, weight="bold"),
        )
        title_lbl.pack(pady=(15, 15))

        # Tên khách hàng / Đối tác
        ctk.CTkLabel(container, text="Tên Khách Hàng / Đối Tác:", anchor="w").pack(fill="x", padx=25, pady=(5, 2))
        self.client_entry = ctk.CTkEntry(container, placeholder_text="Ví dụ: Shop Quần Áo Nam 360, Cổng Nạp Thẻ ABC", height=36)
        self.client_entry.pack(fill="x", padx=25, pady=(0, 10))

        # Thời hạn thuê
        ctk.CTkLabel(container, text="Thời Hạn Thuê API:", anchor="w").pack(fill="x", padx=25, pady=(5, 2))
        duration_options = ["1 Tháng (30 ngày)", "3 Tháng (90 ngày)", "6 Tháng (180 ngày)", "1 Năm (365 ngày)", "Dùng thử (7 ngày)"]
        self.duration_var = ctk.StringVar(value=duration_options[0])
        self.duration_menu = ctk.CTkOptionMenu(container, values=duration_options, variable=self.duration_var, height=36)
        self.duration_menu.pack(fill="x", padx=25, pady=(0, 10))

        # Giới hạn ngân hàng
        ctk.CTkLabel(container, text="Quyền Truy Cập Ngân Hàng:", anchor="w").pack(fill="x", padx=25, pady=(5, 2))
        bank_perm_options = ["Tất Cả Ngân Hàng (*)", "Chỉ MBBank", "Chỉ ACB", "Chỉ Vietcombank", "Chỉ BIDV", "Chỉ TPBank", "Chỉ VietinBank", "Chỉ Techcombank", "Chỉ ZaloPay"]
        self.perm_var = ctk.StringVar(value=bank_perm_options[0])
        self.perm_menu = ctk.CTkOptionMenu(container, values=bank_perm_options, variable=self.perm_var, height=36)
        self.perm_menu.pack(fill="x", padx=25, pady=(0, 10))

        # Webhook URL (nhận tiền vào)
        ctk.CTkLabel(container, text="Webhook URL (Nhận thông báo tiền vào):", anchor="w").pack(fill="x", padx=25, pady=(5, 2))
        self.wh_entry = ctk.CTkEntry(container, placeholder_text="https://domain-cua-khach.com/api/callback", height=36)
        self.wh_entry.pack(fill="x", padx=25, pady=(0, 10))

        # Ghi chú
        ctk.CTkLabel(container, text="Ghi Chú Hợp Đồng / Khách Thuê:", anchor="w").pack(fill="x", padx=25, pady=(5, 2))
        self.note_entry = ctk.CTkEntry(container, placeholder_text="Gói VIP hỗ trợ auto webhook 24/7", height=36)
        self.note_entry.pack(fill="x", padx=25, pady=(0, 15))

        self.err_lbl = ctk.CTkLabel(container, text="", text_color="#EF4444")
        self.err_lbl.pack(pady=(0, 10))

        btn_frame = ctk.CTkFrame(container, fg_color="transparent")
        btn_frame.pack(fill="x", padx=25, pady=(5, 15))

        create_btn = ctk.CTkButton(
            btn_frame,
            text="✨ Tạo API Key Ngay",
            fg_color="#3B82F6",
            hover_color="#2563EB",
            height=40,
            command=self.create_key,
        )
        create_btn.pack(side="left", fill="x", expand=True, padx=(0, 8))

        cancel_btn = ctk.CTkButton(
            btn_frame,
            text="Hủy",
            fg_color="#4B5563",
            hover_color="#374151",
            height=40,
            command=self.destroy,
        )
        cancel_btn.pack(side="right", fill="x", expand=True, padx=(8, 0))

    def create_key(self):
        client_name = self.client_entry.get().strip()
        if not client_name:
            self.err_lbl.configure(text="Vui lòng nhập tên khách hàng / đối tác!")
            return

        dur_text = self.duration_var.get()
        days_map = {
            "1 Tháng (30 ngày)": 30,
            "3 Tháng (90 ngày)": 90,
            "6 Tháng (180 ngày)": 180,
            "1 Năm (365 ngày)": 365,
            "Dùng thử (7 ngày)": 7,
        }
        days = days_map.get(dur_text, 30)

        perm_text = self.perm_var.get()
        if "Tất Cả" in perm_text:
            allowed = "*"
        else:
            clean_code = perm_text.replace("Chỉ", "").strip().upper()
            allowed = [clean_code]

        wh_url = self.wh_entry.get().strip()
        notes = self.note_entry.get().strip()

        key_id, api_key = db.add_api_key(
            client_name=client_name,
            allowed_banks=allowed,
            days=days,
            webhook_url=wh_url,
            notes=notes,
        )

        self.destroy()
        if self.on_success:
            self.on_success(api_key, client_name)


class BotManagerApp(ctk.CTk):
    """Ứng dụng Desktop chính quản lý bot ngân hàng và cho thuê API."""

    def __init__(self):
        super().__init__()

        self.title("7Bank Bot Hub - Quản Lý Bot & Cho Thuê API Ngân Hàng")
        self.geometry("1240 x 780")
        self.minsize(1050, 680)

        # Khởi tạo Server & Poller
        api_port = int(db.get_setting("api_port", "8080"))
        poll_interval = int(db.get_setting("poll_interval_sec", "30"))
        self.api_server = APIGatewayServer(host="0.0.0.0", port=api_port)
        self.auto_poller = AutoPollerAndWebhook(interval_sec=poll_interval)
        self.auto_poller.on_log_callback = self.append_live_log

        # Layout chính
        self.grid_rowconfigure(0, weight=1)
        self.grid_columnconfigure(1, weight=1)

        self.setup_sidebar()
        self.setup_main_views()

        # Chọn view mặc định Dashboard
        self.show_view("dashboard")

        # Tải dữ liệu ban đầu
        self.refresh_all_data()

        # Tự động khởi động API Server nếu cài đặt
        threading.Thread(target=self.start_server_service, daemon=True).start()

    # =========================================================================
    # SIDEBAR & NAVIGATION
    # =========================================================================

    def setup_sidebar(self):
        self.sidebar_frame = ctk.CTkFrame(self, width=230, corner_radius=0)
        self.sidebar_frame.grid(row=0, column=0, sticky="nsew")
        self.sidebar_frame.grid_rowconfigure(6, weight=1)

        # Logo & App Title
        logo_lbl = ctk.CTkLabel(
            self.sidebar_frame,
            text="🏦 7BANK HUB",
            font=ctk.CTkFont(size=20, weight="bold"),
            text_color="#3B82F6",
        )
        logo_lbl.grid(row=0, column=0, padx=20, pady=(20, 2))

        sub_lbl = ctk.CTkLabel(
            self.sidebar_frame,
            text="Hệ Thống Cho Thuê API",
            font=ctk.CTkFont(size=12),
            text_color="#9CA3AF",
        )
        sub_lbl.grid(row=1, column=0, padx=20, pady=(0, 20))

        # Nav Buttons
        self.nav_buttons = {}
        views = [
            ("dashboard", "📊 Tổng Quan"),
            ("banks", "🏦 Bot Ngân Hàng"),
            ("clients", "🔑 Khách Thuê API"),
            ("gateway", "🌐 Cổng Server & Webhook"),
            ("logs", "📜 Lịch Sử & Nhật Ký"),
        ]

        for i, (key, title) in enumerate(views, start=2):
            btn = ctk.CTkButton(
                self.sidebar_frame,
                text=title,
                font=ctk.CTkFont(size=14, weight="bold"),
                height=42,
                corner_radius=8,
                anchor="w",
                fg_color="transparent",
                text_color="#D1D5DB",
                hover_color="#1F2937",
                command=lambda k=key: self.show_view(k),
            )
            btn.grid(row=i, column=0, padx=15, pady=5, sticky="ew")
            self.nav_buttons[key] = btn

        # Server status indicator ở đáy sidebar
        self.status_box = ctk.CTkFrame(self.sidebar_frame, fg_color="#111827", corner_radius=10)
        self.status_box.grid(row=7, column=0, padx=15, pady=20, sticky="ew")

        self.srv_status_lbl = ctk.CTkLabel(
            self.status_box,
            text="API Server: 🔴 Đang Tắt",
            font=ctk.CTkFont(size=12, weight="bold"),
            text_color="#EF4444",
        )
        self.srv_status_lbl.pack(pady=(10, 2))

        self.poller_status_lbl = ctk.CTkLabel(
            self.status_box,
            text="Auto Poll: ⚪ Tắt",
            font=ctk.CTkFont(size=11),
            text_color="#9CA3AF",
        )
        self.poller_status_lbl.pack(pady=(0, 10))

    def show_view(self, view_name: str):
        """Chuyển đổi view hiển thị."""
        for k, btn in self.nav_buttons.items():
            if k == view_name:
                btn.configure(fg_color="#2563EB", text_color="#FFFFFF")
            else:
                btn.configure(fg_color="transparent", text_color="#D1D5DB")

        for k, frame in self.views.items():
            if k == view_name:
                frame.grid(row=0, column=1, sticky="nsew", padx=20, pady=20)
            else:
                frame.grid_forget()

        if view_name == "dashboard":
            self.refresh_dashboard()
        elif view_name == "banks":
            self.refresh_banks_view()
        elif view_name == "clients":
            self.refresh_clients_view()
        elif view_name == "logs":
            self.refresh_logs_view()

    # =========================================================================
    # CÁC VIEW MÀN HÌNH CHÍNH
    # =========================================================================

    def setup_main_views(self):
        self.views = {
            "dashboard": ctk.CTkFrame(self, corner_radius=12),
            "banks": ctk.CTkFrame(self, corner_radius=12),
            "clients": ctk.CTkFrame(self, corner_radius=12),
            "gateway": ctk.CTkFrame(self, corner_radius=12),
            "logs": ctk.CTkFrame(self, corner_radius=12),
        }

        self.setup_dashboard_view()
        self.setup_banks_view()
        self.setup_clients_view()
        self.setup_gateway_view()
        self.setup_logs_view()

    # -------------------------------------------------------------------------
    # 1. VIEW DASHBOARD (TỔNG QUAN)
    # -------------------------------------------------------------------------
    def setup_dashboard_view(self):
        view = self.views["dashboard"]

        # Top Bar
        top_frame = ctk.CTkFrame(view, fg_color="transparent")
        top_frame.pack(fill="x", padx=20, pady=(15, 10))

        title = ctk.CTkLabel(top_frame, text="📊 TỔNG QUAN HỆ THỐNG BOT", font=ctk.CTkFont(size=22, weight="bold"))
        title.pack(side="left")

        ref_btn = ctk.CTkButton(top_frame, text="🔄 Làm Mới Dữ Liệu", width=140, height=36, command=self.refresh_dashboard)
        ref_btn.pack(side="right")

        # 4 KPI Cards
        cards_frame = ctk.CTkFrame(view, fg_color="transparent")
        cards_frame.pack(fill="x", padx=20, pady=10)
        cards_frame.grid_columnconfigure((0, 1, 2, 3), weight=1)

        self.kpi_cards = {}
        kpi_configs = [
            ("banks", "🏦 Bot Ngân Hàng", "0 / 0 Online", "#3B82F6", 0),
            ("balance", "💰 Tổng Số Dư", "0 VND", "#10B981", 1),
            ("clients", "🔑 Khách Thuê Active", "0 Khách", "#8B5CF6", 2),
            ("today_in", "📈 Tiền Vào Hôm Nay", "0 VND", "#F59E0B", 3),
        ]

        for key, title_text, init_val, border_col, col_idx in kpi_configs:
            card = ctk.CTkFrame(cards_frame, corner_radius=10, border_width=1, border_color=border_col)
            card.grid(row=0, column=col_idx, padx=6, pady=5, sticky="ew")

            ctk.CTkLabel(card, text=title_text, font=ctk.CTkFont(size=12), text_color="#9CA3AF").pack(pady=(12, 4))
            val_lbl = ctk.CTkLabel(card, text=init_val, font=ctk.CTkFont(size=17, weight="bold"))
            val_lbl.pack(pady=(0, 12))
            self.kpi_cards[key] = val_lbl

        # Quick Actions
        actions_frame = ctk.CTkFrame(view, corner_radius=10)
        actions_frame.pack(fill="x", padx=20, pady=10)

        ctk.CTkLabel(actions_frame, text="⚡ THAO TÁC NHANH:", font=ctk.CTkFont(size=13, weight="bold")).pack(side="left", padx=15, pady=12)

        ctk.CTkButton(actions_frame, text="➕ Thêm Bot Bank", fg_color="#10B981", hover_color="#059669", width=140, command=self.open_add_bank_dialog).pack(side="left", padx=6)
        ctk.CTkButton(actions_frame, text="🔑 Tạo Key Khách Thuê", fg_color="#3B82F6", hover_color="#2563EB", width=160, command=self.open_add_client_dialog).pack(side="left", padx=6)
        ctk.CTkButton(actions_frame, text="🔍 Kiểm Tra Tất Cả Bot", fg_color="#8B5CF6", hover_color="#7C3AED", width=160, command=self.check_all_banks_async).pack(side="left", padx=6)

        # Recent Transactions Table preview
        ctk.CTkLabel(view, text="📜 BIẾN ĐỘNG SỐ DƯ GẦN NHẤT:", font=ctk.CTkFont(size=15, weight="bold")).pack(anchor="w", padx=20, pady=(15, 5))

        self.dash_tx_frame = ctk.CTkScrollableFrame(view, corner_radius=10, height=260)
        self.dash_tx_frame.pack(fill="both", expand=True, padx=20, pady=(0, 15))

    def refresh_dashboard(self):
        """Cập nhật dữ liệu trên Dashboard."""
        stats = db.get_dashboard_stats()

        self.kpi_cards["banks"].configure(text=f"{stats['online_banks']} / {stats['total_banks']} Online")
        self.kpi_cards["balance"].configure(text=f"{stats['total_balance']:,.0f} VND")
        self.kpi_cards["clients"].configure(text=f"{stats['active_clients']} / {stats['total_clients']} Khách")
        self.kpi_cards["today_in"].configure(text=f"+{stats['today_in_amount']:,.0f} VND")

        # Cập nhật danh sách giao dịch gần nhất
        for widget in self.dash_tx_frame.winfo_children():
            widget.destroy()

        recent_txs = db.get_transactions(limit=15)
        if not recent_txs:
            ctk.CTkLabel(self.dash_tx_frame, text="Chưa có biến động số dư nào được ghi nhận.", text_color="#6B7280").pack(pady=30)
            return

        for tx in recent_txs:
            row = ctk.CTkFrame(self.dash_tx_frame, fg_color="#1E293B", corner_radius=8)
            row.pack(fill="x", pady=4, padx=5)

            sign = "+" if tx["type"] == "IN" else "-"
            amt_col = "#10B981" if tx["type"] == "IN" else "#EF4444"

            b_info = adapter.get_bank_info(tx["bank_code"])
            b_badge = ctk.CTkLabel(row, text=f" {b_info['short_name']} ", fg_color=b_info["color"], corner_radius=6, font=ctk.CTkFont(size=11, weight="bold"))
            b_badge.pack(side="left", padx=(10, 8), pady=8)

            amt_lbl = ctk.CTkLabel(row, text=f"{sign}{tx['amount']:,.0f}đ", font=ctk.CTkFont(size=14, weight="bold"), text_color=amt_col, width=120, anchor="w")
            amt_lbl.pack(side="left", padx=5)

            desc_lbl = ctk.CTkLabel(row, text=tx["description"] or "Không có nội dung", anchor="w", text_color="#E2E8F0")
            desc_lbl.pack(side="left", fill="x", expand=True, padx=10)

            time_lbl = ctk.CTkLabel(row, text=tx["transaction_date"], text_color="#94A3B8", font=ctk.CTkFont(size=11))
            time_lbl.pack(side="right", padx=(5, 12))

    # -------------------------------------------------------------------------
    # 2. VIEW BOT NGÂN HÀNG (BANK BOTS)
    # -------------------------------------------------------------------------
    def setup_banks_view(self):
        view = self.views["banks"]

        # Top Bar
        top_frame = ctk.CTkFrame(view, fg_color="transparent")
        top_frame.pack(fill="x", padx=20, pady=(15, 10))

        title = ctk.CTkLabel(top_frame, text="🏦 QUẢN LÝ BOT NGÂN HÀNG", font=ctk.CTkFont(size=22, weight="bold"))
        title.pack(side="left")

        btn_box = ctk.CTkFrame(top_frame, fg_color="transparent")
        btn_box.pack(side="right")

        check_all_btn = ctk.CTkButton(btn_box, text="⚡ Health Check Tất Cả", fg_color="#8B5CF6", hover_color="#7C3AED", command=self.check_all_banks_async)
        check_all_btn.pack(side="left", padx=5)

        add_b_btn = ctk.CTkButton(btn_box, text="➕ Thêm Bot Bank", fg_color="#10B981", hover_color="#059669", command=self.open_add_bank_dialog)
        add_b_btn.pack(side="left", padx=5)

        # Scrollable bank list
        self.banks_scroll = ctk.CTkScrollableFrame(view, corner_radius=10)
        self.banks_scroll.pack(fill="both", expand=True, padx=20, pady=(5, 15))

    def refresh_banks_view(self):
        """Hiển thị danh sách các bot ngân hàng."""
        for widget in self.banks_scroll.winfo_children():
            widget.destroy()

        banks = db.get_all_banks()
        if not banks:
            empty_frame = ctk.CTkFrame(self.banks_scroll, fg_color="transparent")
            empty_frame.pack(pady=60)
            ctk.CTkLabel(empty_frame, text="Chưa có tài khoản ngân hàng nào được thêm.", font=ctk.CTkFont(size=16), text_color="#9CA3AF").pack(pady=5)
            ctk.CTkButton(empty_frame, text="➕ Thêm Ngân Hàng Ngay", fg_color="#10B981", command=self.open_add_bank_dialog).pack(pady=10)
            return

        for b in banks:
            card = ctk.CTkFrame(self.banks_scroll, corner_radius=10, fg_color="#1E293B", border_width=1, border_color="#334155")
            card.pack(fill="x", padx=10, pady=8)

            b_code = b["bank_code"]
            b_info = adapter.get_bank_info(b_code)

            # Header card
            header = ctk.CTkFrame(card, fg_color="transparent")
            header.pack(fill="x", padx=15, pady=(12, 5))

            # Logo badge
            badge = ctk.CTkLabel(
                header,
                text=f"  {b_info['short_name']}  ",
                fg_color=b_info["color"],
                text_color="#FFFFFF",
                corner_radius=6,
                font=ctk.CTkFont(size=13, weight="bold"),
            )
            badge.pack(side="left", padx=(0, 10))

            # Account & Name
            acc_str = f"STK: {b['account_number']}"
            if b.get("account_name"):
                acc_str += f" ({b['account_name']})"
            acc_lbl = ctk.CTkLabel(header, text=acc_str, font=ctk.CTkFont(size=15, weight="bold"))
            acc_lbl.pack(side="left")

            # Status Badge
            st_color = "#10B981" if b["status"] == "ONLINE" else ("#EF4444" if b["status"] in ["ERROR", "EXPIRED"] else "#F59E0B")
            st_text = f"● {b['status']}"
            st_badge = ctk.CTkLabel(header, text=st_text, text_color=st_color, font=ctk.CTkFont(size=13, weight="bold"))
            st_badge.pack(side="right", padx=10)

            # Details
            body = ctk.CTkFrame(card, fg_color="transparent")
            body.pack(fill="x", padx=15, pady=(0, 10))

            bal_text = f"Số dư: {b['balance']:,.0f} VND"
            ctk.CTkLabel(body, text=bal_text, font=ctk.CTkFont(size=14, weight="bold"), text_color="#10B981").pack(side="left", padx=(0, 20))

            user_text = f"User: {b['username']}"
            ctk.CTkLabel(body, text=user_text, text_color="#94A3B8").pack(side="left", padx=(0, 20))

            if b.get("last_checked"):
                ctk.CTkLabel(body, text=f"Check: {b['last_checked']}", text_color="#64748B", font=ctk.CTkFont(size=11)).pack(side="left")

            # Action Buttons
            footer = ctk.CTkFrame(card, fg_color="transparent")
            footer.pack(fill="x", padx=15, pady=(0, 12))

            chk_btn = ctk.CTkButton(
                footer,
                text="🔍 Kiểm Tra",
                width=100,
                height=32,
                fg_color="#3B82F6",
                command=lambda row=b: self.check_single_bank_async(row),
            )
            chk_btn.pack(side="left", padx=(0, 6))

            hist_btn = ctk.CTkButton(
                footer,
                text="📊 Lấy Lịch Sử",
                width=110,
                height=32,
                fg_color="#6366F1",
                command=lambda row=b: self.fetch_bank_history_async(row),
            )
            hist_btn.pack(side="left", padx=6)

            del_btn = ctk.CTkButton(
                footer,
                text="🗑️ Xóa",
                width=75,
                height=32,
                fg_color="#EF4444",
                hover_color="#DC2626",
                command=lambda bid=b["id"]: self.delete_bank_confirm(bid),
            )
            del_btn.pack(side="right", padx=6)

            if b.get("last_message"):
                msg_lbl = ctk.CTkLabel(card, text=f"Thông báo: {b['last_message']}", text_color="#94A3B8", font=ctk.CTkFont(size=11), anchor="w")
                msg_lbl.pack(fill="x", padx=15, pady=(0, 8))

    # -------------------------------------------------------------------------
    # 3. VIEW KHÁCH THUÊ & API KEYS
    # -------------------------------------------------------------------------
    def setup_clients_view(self):
        view = self.views["clients"]

        top_frame = ctk.CTkFrame(view, fg_color="transparent")
        top_frame.pack(fill="x", padx=20, pady=(15, 10))

        title = ctk.CTkLabel(top_frame, text="🔑 QUẢN LÝ KHÁCH THUÊ API", font=ctk.CTkFont(size=22, weight="bold"))
        title.pack(side="left")

        add_c_btn = ctk.CTkButton(top_frame, text="➕ Tạo API Key Cho Thuê", fg_color="#3B82F6", command=self.open_add_client_dialog)
        add_c_btn.pack(side="right")

        self.clients_scroll = ctk.CTkScrollableFrame(view, corner_radius=10)
        self.clients_scroll.pack(fill="both", expand=True, padx=20, pady=(5, 15))

    def refresh_clients_view(self):
        """Hiển thị danh sách khách thuê API."""
        for widget in self.clients_scroll.winfo_children():
            widget.destroy()

        clients = db.get_all_api_keys()
        if not clients:
            empty_frame = ctk.CTkFrame(self.clients_scroll, fg_color="transparent")
            empty_frame.pack(pady=60)
            ctk.CTkLabel(empty_frame, text="Chưa có khách hàng thuê API nào.", font=ctk.CTkFont(size=16), text_color="#9CA3AF").pack(pady=5)
            ctk.CTkButton(empty_frame, text="➕ Tạo API Key Ngay", fg_color="#3B82F6", command=self.open_add_client_dialog).pack(pady=10)
            return

        for c in clients:
            card = ctk.CTkFrame(self.clients_scroll, corner_radius=10, fg_color="#1E293B", border_width=1, border_color="#334155")
            card.pack(fill="x", padx=10, pady=8)

            header = ctk.CTkFrame(card, fg_color="transparent")
            header.pack(fill="x", padx=15, pady=(12, 4))

            c_name = ctk.CTkLabel(header, text=c["client_name"], font=ctk.CTkFont(size=16, weight="bold"), text_color="#F8FAFC")
            c_name.pack(side="left")

            # Expiry status
            now_dt = datetime.now()
            try:
                exp_dt = datetime.strptime(c["expires_at"], "%Y-%m-%d %H:%M:%S")
                days_left = (exp_dt - now_dt).days
                if days_left > 0:
                    exp_badge_text = f"🟢 Còn {days_left} ngày"
                    exp_col = "#10B981"
                else:
                    exp_badge_text = "🔴 Đã Hết Hạn"
                    exp_col = "#EF4444"
            except Exception:
                exp_badge_text = c["expires_at"]
                exp_col = "#9CA3AF"

            exp_badge = ctk.CTkLabel(header, text=exp_badge_text, text_color=exp_col, font=ctk.CTkFont(size=12, weight="bold"))
            exp_badge.pack(side="right")

            # API Key Box & Copy button
            key_row = ctk.CTkFrame(card, fg_color="#0F172A", corner_radius=6)
            key_row.pack(fill="x", padx=15, pady=6)

            ctk.CTkLabel(key_row, text="API KEY: ", font=ctk.CTkFont(size=12, weight="bold"), text_color="#94A3B8").pack(side="left", padx=(10, 4), pady=6)
            key_val = ctk.CTkLabel(key_row, text=c["api_key"], font=ctk.CTkFont(size=13, family="Consolas", weight="bold"), text_color="#38BDF8")
            key_val.pack(side="left", padx=4)

            copy_btn = ctk.CTkButton(
                key_row,
                text="📋 Copy Key",
                width=80,
                height=26,
                fg_color="#334155",
                hover_color="#475569",
                command=lambda k=c["api_key"]: self.copy_to_clipboard(k),
            )
            copy_btn.pack(side="right", padx=10, pady=4)

            # Details
            details_row = ctk.CTkFrame(card, fg_color="transparent")
            details_row.pack(fill="x", padx=15, pady=4)

            allowed = c.get("allowed_banks", "*")
            allowed_text = "Ngân hàng: Tất cả" if allowed == "*" else f"Ngân hàng: {allowed}"
            ctk.CTkLabel(details_row, text=allowed_text, text_color="#CBD5E1").pack(side="left", padx=(0, 20))

            reqs_text = f"Đã gọi: {c['request_count']} requests"
            ctk.CTkLabel(details_row, text=reqs_text, text_color="#A78BFA").pack(side="left", padx=(0, 20))

            if c.get("webhook_url"):
                ctk.CTkLabel(details_row, text=f"Webhook: {c['webhook_url'][:35]}...", text_color="#38BDF8").pack(side="left")

            # Actions
            actions_row = ctk.CTkFrame(card, fg_color="transparent")
            actions_row.pack(fill="x", padx=15, pady=(4, 12))

            ext_btn = ctk.CTkButton(
                actions_row,
                text="📅 Gia Hạn (+30 ngày)",
                width=150,
                height=30,
                fg_color="#10B981",
                hover_color="#059669",
                command=lambda cid=c["id"]: self.extend_client_key(cid),
            )
            ext_btn.pack(side="left", padx=(0, 6))

            lock_btn_text = "🔒 Khóa" if c["is_active"] == 1 else "🔓 Mở Khóa"
            lock_btn = ctk.CTkButton(
                actions_row,
                text=lock_btn_text,
                width=90,
                height=30,
                fg_color="#F59E0B" if c["is_active"] == 1 else "#3B82F6",
                command=lambda cid=c["id"]: self.toggle_client_key(cid),
            )
            lock_btn.pack(side="left", padx=6)

            del_c_btn = ctk.CTkButton(
                actions_row,
                text="🗑️ Xóa",
                width=70,
                height=30,
                fg_color="#EF4444",
                hover_color="#DC2626",
                command=lambda cid=c["id"]: self.delete_client_confirm(cid),
            )
            del_c_btn.pack(side="right", padx=6)

    # -------------------------------------------------------------------------
    # 4. VIEW CỔNG API & WEBHOOK
    # -------------------------------------------------------------------------
    def setup_gateway_view(self):
        view = self.views["gateway"]

        title = ctk.CTkLabel(view, text="🌐 CỔNG MÁY CHỦ API GATEWAY & WEBHOOK", font=ctk.CTkFont(size=22, weight="bold"))
        title.pack(anchor="w", padx=20, pady=(15, 15))

        # Khung điều khiển Server
        server_box = ctk.CTkFrame(view, corner_radius=10, fg_color="#1E293B")
        server_box.pack(fill="x", padx=20, pady=10)

        ctk.CTkLabel(server_box, text="⚡ ĐIỀU KHIỂN CỔNG CHO THUÊ API", font=ctk.CTkFont(size=15, weight="bold")).pack(anchor="w", padx=15, pady=(12, 6))

        ctrl_row = ctk.CTkFrame(server_box, fg_color="transparent")
        ctrl_row.pack(fill="x", padx=15, pady=(5, 15))

        self.gw_toggle_btn = ctk.CTkButton(
            ctrl_row,
            text="▶ KHỞI ĐỘNG API SERVER",
            fg_color="#10B981",
            hover_color="#059669",
            width=200,
            height=38,
            font=ctk.CTkFont(size=14, weight="bold"),
            command=self.toggle_server_btn_clicked,
        )
        self.gw_toggle_btn.pack(side="left", padx=(0, 20))

        port_str = db.get_setting("api_port", "8080")
        self.port_entry = ctk.CTkEntry(ctrl_row, width=80, height=36, placeholder_text=port_str)
        self.port_entry.insert(0, port_str)
        self.port_entry.pack(side="left", padx=(0, 10))

        ctk.CTkLabel(ctrl_row, text="(Cổng máy chủ lắng nghe kết nối)", text_color="#94A3B8").pack(side="left")

        # Khung Auto Poller
        poller_box = ctk.CTkFrame(view, corner_radius=10, fg_color="#1E293B")
        poller_box.pack(fill="x", padx=20, pady=10)

        ctk.CTkLabel(poller_box, text="🔄 TRÌNH QUÉT TỰ ĐỘNG & BẮN WEBHOOK", font=ctk.CTkFont(size=15, weight="bold")).pack(anchor="w", padx=15, pady=(12, 6))

        poll_row = ctk.CTkFrame(poller_box, fg_color="transparent")
        poll_row.pack(fill="x", padx=15, pady=(5, 15))

        self.poller_switch = ctk.CTkSwitch(
            poll_row,
            text="Bật tự động quét biến động số dư và bắn Webhook",
            font=ctk.CTkFont(size=13, weight="bold"),
            command=self.toggle_poller_switch_clicked,
        )
        self.poller_switch.pack(side="left", padx=(0, 20))

        # Tài liệu API mẫu cho khách thuê
        doc_box = ctk.CTkFrame(view, corner_radius=10)
        doc_box.pack(fill="both", expand=True, padx=20, pady=10)

        ctk.CTkLabel(doc_box, text="📖 HƯỚNG DẪN TÍCH HỢP CHO KHÁCH THUÊ API:", font=ctk.CTkFont(size=14, weight="bold")).pack(anchor="w", padx=15, pady=(10, 4))

        api_guide_text = (
            "1. VẤN TIN SỐ DƯ TÀI KHOẢN:\n"
            "   GET http://localhost:8080/api/v1/balance?api_key=YOUR_API_KEY&bank=MBBANK\n\n"
            "2. LẤY LỊCH SỬ SAO KÊ GIAO DỊCH:\n"
            "   GET http://localhost:8080/api/v1/history?api_key=YOUR_API_KEY&bank=MBBANK&account=STK&days=6\n\n"
            "3. TẠO MÃ QR THANH TOÁN (VIETQR / TPBANK):\n"
            "   POST http://localhost:8080/api/v1/qrcode\n"
            "   Body: {\"api_key\": \"...\", \"bank\": \"TPBANK\", \"amount\": 50000, \"content\": \"DH12345\"}\n\n"
            "4. WEBHOOK BẮN VỀ CLIENT KHI CÓ TIỀN VÀO:\n"
            "   POST {webhook_url_cua_khach}\n"
            "   Body: {\"event\": \"TRANSACTION_INCOMING\", \"bankCode\": \"MBBANK\", \"amount\": 50000, \"description\": \"...\"}"
        )

        doc_tb = ctk.CTkTextbox(doc_box, font=ctk.CTkFont(size=12, family="Consolas"))
        doc_tb.pack(fill="both", expand=True, padx=15, pady=(0, 15))
        doc_tb.insert("1.0", api_guide_text)
        doc_tb.configure(state="disabled")

    # -------------------------------------------------------------------------
    # 5. VIEW LỊCH SỬ & NHẬT KÝ
    # -------------------------------------------------------------------------
    def setup_logs_view(self):
        view = self.views["logs"]

        top_frame = ctk.CTkFrame(view, fg_color="transparent")
        top_frame.pack(fill="x", padx=20, pady=(15, 10))

        title = ctk.CTkLabel(top_frame, text="📜 NHẬT KÝ HOẠT ĐỘNG REALTIME", font=ctk.CTkFont(size=22, weight="bold"))
        title.pack(side="left")

        clear_btn = ctk.CTkButton(top_frame, text="🧹 Xóa Màn Hình Log", width=140, command=self.clear_logs)
        clear_btn.pack(side="right")

        self.log_textbox = ctk.CTkTextbox(view, font=ctk.CTkFont(size=12, family="Consolas"))
        self.log_textbox.pack(fill="both", expand=True, padx=20, pady=(5, 15))

    def append_live_log(self, text: str):
        """Thêm log vào terminal realtime an toàn đa luồng."""
        now_str = datetime.now().strftime("%H:%M:%S")
        log_line = f"[{now_str}] {text}\n"

        def _update():
            if hasattr(self, "log_textbox"):
                self.log_textbox.insert("end", log_line)
                self.log_textbox.see("end")

        self.after(0, _update)

    def clear_logs(self):
        self.log_textbox.delete("1.0", "end")

    def refresh_logs_view(self):
        pass

    # =========================================================================
    # CÁC HÀM XỬ LÝ SỰ KIỆN & THAO TÁC NGHIỆP VỤ
    # =========================================================================

    def refresh_all_data(self):
        """Làm mới toàn bộ dữ liệu."""
        self.refresh_dashboard()

    def open_add_bank_dialog(self):
        """Mở modal thêm bot ngân hàng."""
        AddBankModal(self, on_success_callback=self.on_bank_added)

    def on_bank_added(self, bank_id: int):
        self.append_live_log(f"Đã thêm bot ngân hàng mới (ID: {bank_id})")
        bank_row = db.get_bank_by_id(bank_id)
        if bank_row:
            threading.Thread(target=self.check_single_bank_async, args=(bank_row,), daemon=True).start()
        self.refresh_dashboard()
        self.refresh_banks_view()

    def open_add_client_dialog(self):
        """Mở modal tạo API key cho khách thuê."""
        AddClientModal(self, on_success_callback=self.on_client_added)

    def on_client_added(self, api_key: str, client_name: str):
        self.append_live_log(f"Đã tạo API Key mới cho khách thuê '{client_name}': {api_key}")
        messagebox.showinfo(
            "Tạo API Key Thành Công",
            f"Đã tạo API Key cho đối tác '{client_name}':\n\n{api_key}\n\n(Key đã được lưu an toàn trong cơ sở dữ liệu)",
        )
        self.refresh_dashboard()
        self.refresh_clients_view()

    def check_single_bank_async(self, bank_row: Dict[str, Any]):
        """Kiểm tra tình trạng một bot ngân hàng trên luồng ngầm."""
        stk = bank_row["account_number"]
        b_code = bank_row["bank_code"]
        self.append_live_log(f"Đang kiểm tra kết nối bot {b_code} (STK: {stk})...")

        def _task():
            res = adapter.check_health(bank_row)
            status_text = "Thành công (ONLINE)" if res["success"] else f"Thất bại ({res['message']})"
            self.append_live_log(f"Kết quả kiểm tra {b_code} ({stk}): {status_text}")
            self.after(0, self.refresh_banks_view)
            self.after(0, self.refresh_dashboard)

        threading.Thread(target=_task, daemon=True).start()

    def check_all_banks_async(self):
        """Chạy kiểm tra sức khỏe tất cả bot ngân hàng song song."""
        banks = db.get_all_banks(active_only=True)
        if not banks:
            messagebox.showinfo("Thông Báo", "Không có bot ngân hàng nào đang hoạt động để kiểm tra.")
            return

        self.append_live_log(f"Bắt đầu Health Check đồng thời {len(banks)} bot ngân hàng...")

        def _task():
            for b in banks:
                adapter.check_health(b)
            self.append_live_log("Đã hoàn tất kiểm tra tất cả bot ngân hàng!")
            self.after(0, self.refresh_banks_view)
            self.after(0, self.refresh_dashboard)

        threading.Thread(target=_task, daemon=True).start()

    def fetch_bank_history_async(self, bank_row: Dict[str, Any]):
        """Lấy lịch sử sao kê giao dịch từ ngân hàng."""
        stk = bank_row["account_number"]
        b_code = bank_row["bank_code"]
        self.append_live_log(f"Đang tải lịch sử giao dịch mới nhất của {b_code} (STK: {stk})...")

        def _task():
            hist_res = adapter.get_transactions(bank_row, days=6)
            if hist_res.get("success"):
                count = hist_res.get("count", 0)
                self.append_live_log(f"✅ Đã tải thành công {count} giao dịch từ {b_code} ({stk})")
            else:
                self.append_live_log(f"⚠️ Lỗi lấy lịch sử {b_code} ({stk}): {hist_res.get('message')}")
            self.after(0, self.refresh_dashboard)

        threading.Thread(target=_task, daemon=True).start()

    def delete_bank_confirm(self, bank_id: int):
        """Xác nhận xóa bot ngân hàng."""
        if messagebox.askyesno("Xác Nhận Xóa", "Bạn có chắc chắn muốn xóa tài khoản ngân hàng này?"):
            db.delete_bank(bank_id)
            self.append_live_log(f"Đã xóa bot ngân hàng ID: {bank_id}")
            self.refresh_banks_view()
            self.refresh_dashboard()

    def extend_client_key(self, key_id: int):
        """Gia hạn thêm 30 ngày cho khách thuê."""
        new_exp = db.extend_api_key(key_id, extra_days=30)
        self.append_live_log(f"Đã gia hạn thêm 30 ngày cho key ID {key_id} (Hạn mới: {new_exp})")
        messagebox.showinfo("Gia Hạn Thành Công", f"Đã gia hạn thành công!\nThời hạn mới: {new_exp}")
        self.refresh_clients_view()

    def toggle_client_key(self, key_id: int):
        """Khóa hoặc mở khóa API key."""
        new_st = db.toggle_api_key_active(key_id)
        st_desc = "Đã MỞ KHÓA" if new_st == 1 else "Đã KHÓA"
        self.append_live_log(f"{st_desc} API Key ID: {key_id}")
        self.refresh_clients_view()

    def delete_client_confirm(self, key_id: int):
        """Xóa API key của khách thuê."""
        if messagebox.askyesno("Xác Nhận Xóa", "Bạn có chắc chắn muốn xóa khách thuê API này?"):
            db.delete_api_key(key_id)
            self.append_live_log(f"Đã xóa API Key ID: {key_id}")
            self.refresh_clients_view()
            self.refresh_dashboard()

    def copy_to_clipboard(self, text: str):
        """Sao chép chuỗi vào clipboard."""
        self.clipboard_clear()
        self.clipboard_append(text)
        self.append_live_log(f"Đã copy API Key vào bộ nhớ tạm: {text[:15]}...")

    # -------------------------------------------------------------------------
    # ĐIỀU KHIỂN DỊCH VỤ SERVER VÀ POLLER
    # -------------------------------------------------------------------------

    def toggle_server_btn_clicked(self):
        """Bật/tắt API Server khi người dùng bấm nút."""
        if self.api_server.is_running:
            self.api_server.stop()
            self.gw_toggle_btn.configure(text="▶ KHỞI ĐỘNG API SERVER", fg_color="#10B981")
            self.srv_status_lbl.configure(text="API Server: 🔴 Đang Tắt", text_color="#EF4444")
            self.append_live_log("Đã dừng cổng máy chủ API Gateway.")
        else:
            try:
                new_port = int(self.port_entry.get().strip())
                self.api_server.port = new_port
                db.set_setting("api_port", str(new_port))
            except Exception:
                pass
            self.start_server_service()

    def start_server_service(self):
        """Khởi động tiến trình Server."""
        ok = self.api_server.start()
        if ok:
            self.after(0, lambda: self.gw_toggle_btn.configure(text="⏹ DỪNG API SERVER", fg_color="#EF4444"))
            self.after(0, lambda: self.srv_status_lbl.configure(text=f"API Server: 🟢 Port {self.api_server.port}", text_color="#10B981"))
            self.append_live_log(f"Cổng máy chủ API đã hoạt động tại http://localhost:{self.api_server.port}")
        else:
            self.append_live_log(f"Lỗi: Không thể khởi động server tại cổng {self.api_server.port}")

    def toggle_poller_switch_clicked(self):
        """Bật/tắt Auto Poller quét định kỳ."""
        if self.poller_switch.get() == 1:
            self.auto_poller.start()
            self.poller_status_lbl.configure(text=f"Auto Poll: 🟢 Bật ({self.auto_poller.interval_sec}s)", text_color="#10B981")
        else:
            self.auto_poller.stop()
            self.poller_status_lbl.configure(text="Auto Poll: ⚪ Tắt", text_color="#9CA3AF")


# =============================================================================
# ENTRYPOINT KHỞI CHẠY APP
# =============================================================================
if __name__ == "__main__":
    app = BotManagerApp()
    app.mainloop()
