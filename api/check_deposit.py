import json
from http.server import BaseHTTPRequestHandler
import urllib.parse
import os
import sys
import datetime

# Import local mbbank package
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import mbbank
from supabase import create_client, Client

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Enable CORS
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

        # Parse query params
        parsed_url = urllib.parse.urlparse(self.path)
        query_params = urllib.parse.parse_qs(parsed_url.query)
        deposit_id = query_params.get('deposit_id', [None])[0]

        if not deposit_id:
            self.wfile.write(json.dumps({
                'status': 'error',
                'message': 'Thiếu tham số deposit_id.'
            }).encode('utf-8'))
            return

        try:
            # Initialize Supabase Client
            supabase_url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
            supabase_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
            
            if not supabase_url or not supabase_key:
                self.wfile.write(json.dumps({
                    'status': 'error',
                    'message': 'Cấu hình Supabase thiếu biến môi trường.'
                }).encode('utf-8'))
                return

            supabase: Client = create_client(supabase_url, supabase_key)

            # 1. Fetch deposit record
            res = supabase.table('deposits').select('*').eq('id', deposit_id).execute()
            if not res.data:
                self.wfile.write(json.dumps({
                    'status': 'error',
                    'message': 'Không tìm thấy yêu cầu nạp tiền.'
                }).encode('utf-8'))
                return

            deposit = res.data[0]
            if deposit['status'] == 'completed':
                self.wfile.write(json.dumps({
                    'status': 'success',
                    'message': 'Hóa đơn nạp tiền đã hoàn thành trước đó.'
                }).encode('utf-8'))
                return

            # 2. Fetch Bank settings
            settings_res = supabase.table('settings').select('value').eq('key', 'bank_settings').execute()
            if not settings_res.data:
                self.wfile.write(json.dumps({
                    'status': 'error',
                    'message': 'Hệ thống chưa cấu hình tài khoản nhận tiền.'
                }).encode('utf-8'))
                return

            val = settings_res.data[0]['value']
            mb_user = val.get('mb_username')
            mb_pass = val.get('mb_password')
            mb_account = val.get('account_number')

            if not mb_user or not mb_pass or not mb_account:
                self.wfile.write(json.dumps({
                    'status': 'error',
                    'message': 'Cấu hình MBBank chưa hoàn chỉnh trong Admin.'
                }).encode('utf-8'))
                return

            # 3. Fetch MBBank Transaction History
            mb = mbbank.MBBank(username=mb_user, password=mb_pass)
            
            # GMT+7 Timezone for Vietnam (essential for Vercel servers running in UTC)
            tz_vn = datetime.timezone(datetime.timedelta(hours=7))
            to_date = datetime.datetime.now(tz_vn)
            from_date = to_date - datetime.timedelta(days=1) # Search last 1 day

            history = mb.getTransactionAccountHistory(
                accountNo=mb_account, 
                from_date=from_date, 
                to_date=to_date
            )

            # 4. Check for matching deposit transaction
            found_tx = False
            tx_ref = deposit['tx_ref'].upper()
            deposit_amount = float(deposit['amount'])

            if history and history.transactionHistoryList:
                for tx in history.transactionHistoryList:
                    desc = getattr(tx, 'description', '').upper()
                    amount = float(getattr(tx, 'creditAmount', 0))
                    
                    if tx_ref in desc and amount >= deposit_amount:
                        found_tx = True
                        break

            # 5. Process if found
            if found_tx:
                # Call Supabase RPC function process_deposit to atomically add balance and update status
                rpc_res = supabase.rpc('process_deposit', {'p_deposit_id': deposit_id}).execute()
                if rpc_res.data:
                    self.wfile.write(json.dumps({
                        'status': 'success',
                        'message': 'Nạp tiền thành công! Số dư đã được cộng.'
                    }).encode('utf-8'))
                    return
                else:
                    self.wfile.write(json.dumps({
                        'status': 'error',
                        'message': 'Lỗi xử lý cộng tiền trên cơ sở dữ liệu.'
                    }).encode('utf-8'))
                    return
            else:
                self.wfile.write(json.dumps({
                    'status': 'pending',
                    'message': 'Hệ thống chưa nhận được giao dịch. Vui lòng đợi 1-2 phút hoặc bấm kiểm tra lại.'
                }).encode('utf-8'))

        except Exception as e:
            self.wfile.write(json.dumps({
                'status': 'error',
                'message': f'Lỗi hệ thống kiểm tra nạp tiền: {str(e)}'
            }).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
