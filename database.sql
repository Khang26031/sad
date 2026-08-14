-- SQL Script V2: Cấu hình Database cho LEGION STORE (Nạp tiền & Thanh toán số dư)
-- Hãy copy toàn bộ nội dung file này và chạy trong mục SQL Editor trên Supabase Dashboard.

-- ================= CLEAN UP OLD TABLES & POLICIES =================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.process_completed_order(p_order_id UUID);
DROP FUNCTION IF EXISTS public.get_order_by_tx_ref(p_tx_ref TEXT);
DROP FUNCTION IF EXISTS public.get_orders_by_email(p_email TEXT);
DROP FUNCTION IF EXISTS public.is_admin(p_user_id UUID);

DROP TABLE IF EXISTS public.items CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;
DROP TABLE IF EXISTS public.settings CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.deposits CASCADE;

-- 1. BẢNG THÔNG TIN NGƯỜI DÙNG (PROFILES)
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL PRIMARY KEY,
    email TEXT,
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    balance NUMERIC DEFAULT 0 CHECK (balance >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Hàm kiểm tra admin (SECURITY DEFINER chạy bằng quyền hệ thống)
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = p_user_id AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policies cho profiles
CREATE POLICY "Cho phép người dùng đọc thông tin của chính mình" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Cho phép người dùng cập nhật thông tin của chính mình" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admin có toàn quyền trên profiles" ON public.profiles
    FOR ALL USING (public.is_admin(auth.uid()));

-- Trigger tự động tạo profile khi đăng ký tài khoản
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, role, balance)
    VALUES (
        new.id, 
        new.email, 
        CASE 
            WHEN (SELECT COUNT(*) FROM public.profiles) = 0 THEN 'admin'
            ELSE 'user'
        END,
        0
    );
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 2. BẢNG CÀI ĐẶT CẤU HÌNH HỆ THỐNG (SETTINGS)
CREATE TABLE public.settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin có toàn quyền trên settings" ON public.settings FOR ALL USING (public.is_admin(auth.uid()));
CREATE POLICY "Cho phép khách xem thông tin công khai" ON public.settings FOR SELECT USING (TRUE);


-- 3. BẢNG DANH MỤC SẢN PHẨM (CATEGORIES)
CREATE TABLE public.categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mọi người đều có thể xem danh mục" ON public.categories FOR SELECT USING (TRUE);
CREATE POLICY "Admin có quyền chỉnh sửa danh mục" ON public.categories FOR ALL USING (public.is_admin(auth.uid()));


-- 4. BẢNG SẢN PHẨM (PRODUCTS)
CREATE TABLE public.products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    price NUMERIC NOT NULL CHECK (price >= 0),
    image_url TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    product_type TEXT DEFAULT 'auto' CHECK (product_type IN ('auto', 'manual')),
    form_fields JSONB DEFAULT '[]'::jsonb,
    manual_stock INTEGER DEFAULT 0 CHECK (manual_stock >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mọi người đều có thể xem sản phẩm hoạt động" ON public.products 
    FOR SELECT USING (status = 'active' OR public.is_admin(auth.uid()));
CREATE POLICY "Admin có quyền quản lý sản phẩm" ON public.products 
    FOR ALL USING (public.is_admin(auth.uid()));


-- 5. BẢNG KHO KEY / TÀI KHOẢN (ITEMS - Chỉ áp dụng cho product_type = 'auto')
CREATE TABLE public.items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    is_sold BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    sold_at TIMESTAMP WITH TIME ZONE,
    order_id UUID
);

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Chỉ Admin mới có thể đọc ghi bảng items" ON public.items FOR ALL USING (public.is_admin(auth.uid()));


-- 6. BẢNG ĐƠN HÀNG (ORDERS)
CREATE TABLE public.orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    buyer_email TEXT NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    amount NUMERIC NOT NULL CHECK (amount >= 0),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    tx_ref TEXT UNIQUE NOT NULL,
    key_content TEXT,
    customer_inputs JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Người dùng xem đơn hàng của mình" ON public.orders
    FOR SELECT USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Admin quản lý mọi đơn hàng" ON public.orders
    FOR ALL USING (public.is_admin(auth.uid()));

CREATE POLICY "Cho phép tạo đơn hàng mới" ON public.orders
    FOR INSERT WITH CHECK (TRUE);


-- 7. BẢNG HÓA ĐƠN NẠP TIỀN (DEPOSITS)
CREATE TABLE public.deposits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    amount NUMERIC NOT NULL CHECK (amount >= 10000),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    tx_ref TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Người dùng xem hóa đơn nạp của mình" ON public.deposits
    FOR SELECT USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Cho phép người dùng tạo hóa đơn nạp" ON public.deposits
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admin quản lý mọi hóa đơn nạp" ON public.deposits
    FOR ALL USING (public.is_admin(auth.uid()));


-- ================= DATABASE FUNCTIONS (RPCs) BẢO MẬT =================

-- Hàm mua hàng bằng số dư tài khoản
CREATE OR REPLACE FUNCTION public.purchase_product(p_product_id UUID, p_customer_inputs JSONB)
RETURNS TEXT AS $$
DECLARE
    v_buyer_id UUID;
    v_buyer_email TEXT;
    v_price NUMERIC;
    v_type TEXT;
    v_stock INTEGER;
    v_balance NUMERIC;
    v_order_id UUID;
    v_tx_ref TEXT;
    v_key_id UUID;
    v_key_content TEXT;
BEGIN
    -- 1. Lấy thông tin người mua
    v_buyer_id := auth.uid();
    IF v_buyer_id IS NULL THEN
        RAISE EXCEPTION 'Bạn cần đăng nhập để thực hiện giao dịch.';
    END IF;
    
    SELECT email, balance INTO v_buyer_email, v_balance FROM public.profiles WHERE id = v_buyer_id FOR UPDATE;

    -- 2. Lấy thông tin sản phẩm
    SELECT price, product_type, manual_stock INTO v_price, v_type, v_stock 
    FROM public.products WHERE id = p_product_id FOR UPDATE;
    
    IF v_price IS NULL THEN
        RAISE EXCEPTION 'Sản phẩm không tồn tại.';
    END IF;

    -- 3. Kiểm tra số lượng kho hàng (Stock)
    IF v_type = 'auto' THEN
        SELECT COUNT(*) INTO v_stock FROM public.items WHERE product_id = p_product_id AND is_sold = FALSE;
        IF v_stock = 0 THEN
            RAISE EXCEPTION 'Sản phẩm đã hết hàng trong kho!';
        END IF;
    ELSE
        IF v_stock <= 0 THEN
            RAISE EXCEPTION 'Sản phẩm đã hết lượt nhận cày thuê/nâng cấp!';
        END IF;
    END IF;

    -- 4. Kiểm tra số dư người dùng
    IF v_balance < v_price THEN
        RAISE EXCEPTION 'Số dư ví không đủ để thanh toán. Vui lòng nạp thêm tiền.';
    END IF;

    -- 5. Trừ tiền tài khoản người dùng
    UPDATE public.profiles SET balance = balance - v_price WHERE id = v_buyer_id;

    -- 6. Tạo mã giao dịch ngẫu nhiên
    v_tx_ref := 'SHOP' || extract(epoch from now())::bigint || floor(random() * 1000)::int;

    -- 7. Xử lý theo từng loại sản phẩm
    IF v_type = 'auto' THEN
        -- Đơn hàng Auto: Khóa 1 key trong kho
        SELECT id, content INTO v_key_id, v_key_content
        FROM public.items
        WHERE product_id = p_product_id AND is_sold = FALSE
        LIMIT 1
        FOR UPDATE SKIP LOCKED;

        IF v_key_id IS NULL THEN
            RAISE EXCEPTION 'Hệ thống bận hoặc hết hàng, vui lòng thử lại.';
        END IF;

        -- Tạo đơn hàng đã hoàn thành
        INSERT INTO public.orders (user_id, buyer_email, product_id, amount, status, tx_ref, key_content, customer_inputs)
        VALUES (v_buyer_id, v_buyer_email, p_product_id, v_price, 'completed', v_tx_ref, v_key_content, p_customer_inputs)
        RETURNING id INTO v_order_id;

        -- Cập nhật trạng thái key
        UPDATE public.items 
        SET is_sold = TRUE, sold_at = now(), order_id = v_order_id 
        WHERE id = v_key_id;

        RETURN v_key_content;
    ELSE
        -- Đơn hàng Manual: Trừ 1 stock thủ công của sản phẩm
        UPDATE public.products SET manual_stock = manual_stock - 1 WHERE id = p_product_id;

        -- Tạo đơn hàng chờ xử lý (processing)
        INSERT INTO public.orders (user_id, buyer_email, product_id, amount, status, tx_ref, customer_inputs)
        VALUES (v_buyer_id, v_buyer_email, p_product_id, v_price, 'processing', v_tx_ref, p_customer_inputs);

        RETURN 'ManualOrderSubmitted';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Hàm xử lý hóa đơn nạp tiền tự động (Auto Check MBBank)
CREATE OR REPLACE FUNCTION public.process_deposit(p_deposit_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID;
    v_amount NUMERIC;
    v_status TEXT;
BEGIN
    SELECT user_id, amount, status INTO v_user_id, v_amount, v_status 
    FROM public.deposits WHERE id = p_deposit_id FOR UPDATE;

    IF v_status = 'completed' THEN
        RETURN TRUE;
    END IF;

    -- Cộng số dư
    UPDATE public.profiles SET balance = balance + v_amount WHERE id = v_user_id;

    -- Đổi trạng thái nạp tiền
    UPDATE public.deposits SET status = 'completed' WHERE id = p_deposit_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Hàm cho phép Admin điều chỉnh số dư ví của khách hàng
CREATE OR REPLACE FUNCTION public.admin_adjust_balance(p_user_id UUID, p_amount NUMERIC)
RETURNS NUMERIC AS $$
DECLARE
    v_new_balance NUMERIC;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Quyền truy cập bị từ chối. Chỉ dành cho Admin.';
    END IF;

    UPDATE public.profiles 
    SET balance = balance + p_amount 
    WHERE id = p_user_id
    RETURNING balance INTO v_new_balance;

    RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Hàm cho phép Admin hoàn thành đơn hàng cày thuê thủ công
CREATE OR REPLACE FUNCTION public.admin_complete_manual_order(p_order_id UUID, p_key_content TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Quyền truy cập bị từ chối. Chỉ dành cho Admin.';
    END IF;

    UPDATE public.orders 
    SET status = 'completed', key_content = p_key_content 
    WHERE id = p_order_id AND status = 'processing';

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Hàm tra cứu đơn hàng bằng Mã đơn hàng an toàn (Cho khách vãng lai/người dùng)
CREATE OR REPLACE FUNCTION public.get_order_by_tx_ref(p_tx_ref TEXT)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    buyer_email TEXT,
    product_id UUID,
    amount NUMERIC,
    status TEXT,
    tx_ref TEXT,
    key_content TEXT,
    customer_inputs JSONB,
    created_at TIMESTAMP WITH TIME ZONE,
    product_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id, o.user_id, o.buyer_email, o.product_id, o.amount, o.status, o.tx_ref, o.key_content, o.customer_inputs, o.created_at,
        p.name AS product_name
    FROM public.orders o
    LEFT JOIN public.products p ON o.product_id = p.id
    WHERE o.tx_ref = p_tx_ref;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Hàm tra cứu đơn hàng bằng Email an toàn (Chỉ cho phép chính chủ hoặc Admin)
CREATE OR REPLACE FUNCTION public.get_orders_by_email(p_email TEXT)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    buyer_email TEXT,
    product_id UUID,
    amount NUMERIC,
    status TEXT,
    tx_ref TEXT,
    key_content TEXT,
    customer_inputs JSONB,
    created_at TIMESTAMP WITH TIME ZONE,
    product_name TEXT
) AS $$
BEGIN
    IF auth.jwt() ->> 'email' = p_email OR public.is_admin(auth.uid()) THEN
        RETURN QUERY
        SELECT 
            o.id, o.user_id, o.buyer_email, o.product_id, o.amount, o.status, o.tx_ref, o.key_content, o.customer_inputs, o.created_at,
            p.name AS product_name
        FROM public.orders o
        LEFT JOIN public.products p ON o.product_id = p.id
        WHERE o.buyer_email = p_email;
    ELSE
        RAISE EXCEPTION 'Bạn cần đăng nhập bằng chính tài khoản email này để tra cứu.';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ================= CHÈN DỮ LIỆU CẤU HÌNH BAN ĐẦU =================
INSERT INTO public.settings (key, value) VALUES
('bank_settings', '{
    "bank_name": "MBBank",
    "account_number": "123456789",
    "account_name": "NGUYEN VAN A",
    "qr_template": "https://api.vietqr.io/image/970422-{account_number}-compact2.jpg?amount={amount}&addInfo={memo}&accountName={account_name}"
}'::jsonb)
ON CONFLICT (key) DO NOTHING;
