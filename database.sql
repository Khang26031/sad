-- SQL Script: Cấu hình Database cho Shop Bán Key/Tài Khoản Tự Động
-- Hãy copy toàn bộ nội dung file này và chạy trong mục SQL Editor trên Supabase Dashboard.

-- 1. BẢNG THÔNG TIN NGƯỜI DÙNG (PROFILES)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL PRIMARY KEY,
    email TEXT,
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    balance NUMERIC DEFAULT 0 CHECK (balance >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cho phép người dùng đọc thông tin của chính mình" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Cho phép người dùng cập nhật thông tin của chính mình" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admin có toàn quyền trên profiles" ON public.profiles
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

-- Tự động tạo profile khi có user đăng ký qua Supabase Auth
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

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 2. BẢNG CÀI ĐẶT CẤU HÌNH HỆ THỐNG (SETTINGS)
CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin có toàn quyền trên settings" ON public.settings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Cho phép khách xem thông tin công khai" ON public.settings
    FOR SELECT USING (TRUE);


-- 3. BẢNG DANH MỤC SẢN PHẨM (CATEGORIES)
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mọi người đều có thể xem danh mục" ON public.categories FOR SELECT USING (TRUE);
CREATE POLICY "Admin có quyền chỉnh sửa danh mục" ON public.categories FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);


-- 4. BẢNG SẢN PHẨM (PRODUCTS)
CREATE TABLE IF NOT EXISTS public.products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC NOT NULL CHECK (price >= 0),
    image_url TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mọi người đều có thể xem sản phẩm hoạt động" ON public.products 
    FOR SELECT USING (status = 'active' OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
CREATE POLICY "Admin có quyền quản lý sản phẩm" ON public.products 
    FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));


-- 5. BẢNG KHO KEY / TÀI KHOẢN (ITEMS)
CREATE TABLE IF NOT EXISTS public.items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    is_sold BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    sold_at TIMESTAMP WITH TIME ZONE,
    order_id UUID
);

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Chỉ Admin mới có thể đọc ghi bảng items" ON public.items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );


-- 6. BẢNG ĐƠN HÀNG (ORDERS)
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    buyer_email TEXT NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    amount NUMERIC NOT NULL CHECK (amount >= 0),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    tx_ref TEXT UNIQUE NOT NULL,
    key_content TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Người dùng xem đơn hàng của mình" ON public.orders
    FOR SELECT USING (
        auth.uid() = user_id OR 
        buyer_email = (SELECT email FROM public.profiles WHERE id = auth.uid()) OR
        tx_ref = (SELECT tx_ref FROM public.orders WHERE id = orders.id)
    );

CREATE POLICY "Admin quản lý mọi đơn hàng" ON public.orders
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );


-- 7. DATABASE FUNCTION BÁN KEY BẢO MẬT (RPC)
CREATE OR REPLACE FUNCTION public.process_completed_order(p_order_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_product_id UUID;
    v_key_id UUID;
    v_key_content TEXT;
    v_status TEXT;
BEGIN
    SELECT product_id, status INTO v_product_id, v_status FROM public.orders WHERE id = p_order_id FOR UPDATE;
    
    IF v_status = 'completed' THEN
        SELECT key_content INTO v_key_content FROM public.orders WHERE id = p_order_id;
        RETURN v_key_content;
    END IF;

    SELECT id, content INTO v_key_id, v_key_content
    FROM public.items
    WHERE product_id = v_product_id AND is_sold = FALSE
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_key_id IS NULL THEN
        UPDATE public.orders SET status = 'failed' WHERE id = p_order_id;
        RETURN 'HẾT HÀNG! Vui lòng liên hệ Admin để được hoàn tiền hoặc bổ sung key.';
    END IF;

    UPDATE public.items 
    SET is_sold = TRUE, sold_at = now(), order_id = p_order_id 
    WHERE id = v_key_id;

    UPDATE public.orders 
    SET status = 'completed', key_content = v_key_content 
    WHERE id = p_order_id;

    RETURN v_key_content;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 8. THÊM DỮ LIỆU CẤU HÌNH MẪU BAN ĐẦU
INSERT INTO public.settings (key, value) VALUES
('bank_settings', '{
    "bank_name": "MBBank",
    "account_number": "123456789",
    "account_name": "NGUYEN VAN A",
    "qr_template": "https://api.vietqr.io/image/970422-{account_number}-compact2.jpg?amount={amount}&addInfo={memo}&accountName={account_name}"
}'::jsonb)
ON CONFLICT (key) DO NOTHING;
