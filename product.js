
// product.js - Standalone product detail logic
let currentProduct = null;

async function initProductPage() {
  const loader = document.getElementById('product-detail-loader');
  const detailBox = document.getElementById('product-detail-box');
  
  // Parse slug from URL: /san-pham/netflix-premium
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const slug = pathParts[pathParts.length - 1];

  if (!slug) {
    if (loader) loader.innerHTML = '<p style="color: var(--danger);">Đường dẫn sản phẩm không hợp lệ.</p>';
    return;
  }

  try {
    const { data: product, error } = await supabaseClient
      .from('products')
      .select('*, categories(name)')
      .eq('slug', slug)
      .single();

    if (error || !product) throw error || new Error('Không tìm thấy sản phẩm');
    currentProduct = product;

    // Fetch stock
    let stock = 0;
    if (product.product_type === 'auto') {
      const { count } = await supabaseClient
        .from('items')
        .select('*', { count: 'exact', head: true })
        .eq('product_id', product.id)
        .eq('is_sold', false);
      stock = count || 0;
    } else {
      stock = product.manual_stock || 0;
    }
    currentProduct.stock = stock;

    // Render details
    const imgEl = document.getElementById('prod-img');
    const titleEl = document.getElementById('prod-title');
    const catEl = document.getElementById('prod-cat');
    const priceEl = document.getElementById('prod-price');
    const descEl = document.getElementById('prod-desc');
    const stockBadge = document.getElementById('prod-stock');
    const buyBtn = document.getElementById('btn-buy-now');

    if (imgEl) imgEl.src = product.image_url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=60';
    if (titleEl) titleEl.innerText = product.name;
    if (catEl) catEl.innerText = product.categories?.name || 'Sản phẩm';
    if (priceEl) priceEl.innerText = formatVND(product.price);
    if (descEl) descEl.innerText = product.description || 'Sản phẩm uy tín, chất lượng hàng đầu.';

    if (stockBadge) {
      if (stock === 0) {
        stockBadge.innerText = 'Hết hàng';
        stockBadge.className = 'stock-badge empty';
        if (buyBtn) {
          buyBtn.disabled = true;
          buyBtn.style.opacity = '0.5';
          buyBtn.innerText = 'Hết Hàng';
        }
      } else {
        stockBadge.innerText = `Kho: Còn lại ${stock}`;
        stockBadge.className = 'stock-badge';
      }
    }

    document.title = `${product.name} - LEGION STORE`;

    if (loader) loader.classList.add('d-none');
    if (detailBox) detailBox.classList.remove('d-none');

    if (buyBtn) {
      buyBtn.onclick = () => window.openPurchaseModal(product.id);
    }
  } catch (err) {
    if (loader) loader.innerHTML = `<p style="color: var(--danger); text-align: center;">Lỗi tải sản phẩm: ${err.message}</p>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initProductPage();
});
