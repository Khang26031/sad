import os
import json
import datetime
from urllib.parse import parse_qs, urlparse
from http.server import BaseHTTPRequestHandler
from supabase import create_client, Client

import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import mbbank

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.end_headers()

        query = parse_qs(urlparse(self.path).query)
        order_id = query.get('order_id', [None])[0]

        if not order_id:
            self.wfile.write(json.dumps({'status': 'error', 'message': 'Missing order_id'}).encode('utf-8'))
            return

        supabase_url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
        supabase_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

        if not supabase_url or not supabase_key:
            self.wfile.write(json.dumps({'status': 'error', 'message': 'Server configuration error'}).encode('utf-8'))
            return

        try:
            supabase: Client = create_client(supabase_url, supabase_key)

            order_res = supabase.table('orders').select('*').eq('id', order_id).execute()
            if not order_res.data:
                self.wfile.write(json.dumps({'status': 'error', 'message': 'Order not found'}).encode('utf-8'))
                return

            order = order_res.data[0]
            
            if order['status'] == 'completed':
                self.wfile.write(json.dumps({
                    'status': 'success', 
                    'message': 'Thanh toán thành công!', 
                    'key': order['key_content']
                }).encode('utf-8'))
                return
                
            if order['status'] == 'failed':
                self.wfile.write(json.dumps({
                    'status': 'failed', 
                    'message': 'Đơn hàng đã thất bại hoặc đã bị hủy.'
                }).encode('utf-8'))
                return

            mb_user = os.environ.get('MB_USERNAME')
            mb_pass = os.environ.get('MB_PASSWORD')
            mb_account = os.environ.get('MB_ACCOUNT')

            if not mb_user or not mb_pass or not mb_account:
                settings_res = supabase.table('settings').select('value').eq('key', 'bank_settings').execute()
                if settings_res.data:
                    val = settings_res.data[0]['value']
                    mb_user = mb_user or val.get('mb_username')
                    mb_pass = mb_pass or val.get('mb_password')
                    mb_account = mb_account or val.get('account_number')

            if not mb_user or not mb_pass or not mb_account:
                self.wfile.write(json.dumps({
                    'status': 'error', 
                    'message': 'Cấu hình tài khoản ngân hàng chưa đầy đủ. Vui lòng liên hệ Admin.'
                }).encode('utf-8'))
                return

            mb = mbbank.MBBank(username=mb_user, password=mb_pass)

            # Cấu hình múi giờ GMT+7 (Việt Nam) bắt buộc cho máy chủ Vercel (chạy UTC mặc định)
            tz_vn = datetime.timezone(datetime.timedelta(hours=7))
            to_date = datetime.datetime.now(tz_vn)
            # Quét rộng ra 1 ngày để đảm bảo không bị hụt múi giờ
            from_date = to_date - datetime.timedelta(days=1)

            history = mb.getTransactionAccountHistory(
                accountNo=mb_account, 
                from_date=from_date, 
                to_date=to_date
            )

            found_tx = False
            tx_ref = order['tx_ref'].upper()
            order_amount = float(order['amount'])

            if history and history.transactionHistoryList:
                for tx in history.transactionHistoryList:
                    desc = getattr(tx, 'description', '').upper()
                    amount = float(getattr(tx, 'creditAmount', 0))
                    
                    if tx_ref in desc and amount >= order_amount:
                        found_tx = True
                        break

            if found_tx:
                rpc_res = supabase.rpc('process_completed_order', {'p_order_id': order_id}).execute()
                key_content = rpc_res.data if rpc_res.data else 'HẾT HÀNG! Liên hệ Admin để nhận hỗ trợ.'
                
                self.wfile.write(json.dumps({
                    'status': 'success',
                    'message': 'Thanh toán thành công!',
                    'key': key_content
                }).encode('utf-8'))
            else:
                self.wfile.write(json.dumps({
                    'status': 'pending',
                    'message': 'Chưa nhận được thanh toán. Vui lòng chuyển khoản đúng nội dung và số tiền.'
                }).encode('utf-8'))

        except Exception as e:
            self.wfile.write(json.dumps({
                'status': 'error',
                'message': f'Lỗi hệ thống kiểm tra thanh toán: {str(e)}'
            }).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.end_headers()
